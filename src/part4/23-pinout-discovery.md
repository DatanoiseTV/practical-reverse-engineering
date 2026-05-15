# Mapping Unknown Boards: Pinout Discovery

Reverse engineering firmware is a software task; reverse engineering
the **board** is the prerequisite that often gets skipped. You bought
a no-name dev board on Aliexpress, you pulled an MCU off a discarded
appliance and soldered it to a breakout, you have a custom board
from a project nobody documented, or you have an ESP32 module on a
PCB where the manufacturer remapped pins to suit their layout. The
silkscreen says "GP0" for one pin and the next twenty are unlabelled.

This chapter is about figuring out which physical pin is which logical
pin. The technique that works on essentially every microcontroller
family is delightfully simple: write a "pin announcer" firmware that
configures every GPIO as a software UART transmitter and continuously
emits a string identifying that pin. Probe each pin with a logic
analyser or USB-UART adapter, read the string, and you know which
physical pin corresponds to which port/bit.

## Why you cannot just read the datasheet

The chip's datasheet tells you the package's pinout — pin 1 is
PA0, pin 2 is PA1, and so on. But:

* On a module (ESP-WROOM, nRF52 module, BL602 module) the chip is
  inside a metal can. The module's pinout maps "module pin 14" to
  "chip pin 9" (which is some GPIO), and the module's datasheet may
  or may not be public.
* On a custom board the silkscreen says "GP3" or "D5" or just
  numbers. The mapping to chip pins lives in the schematic.
* Some boards omit pins that exist on the chip (because they are
  used internally for the radio or flash) and renumber what is left.
* Some board makers helpfully relabel pins to "Arduino" numbers
  that have no relationship to the chip's actual GPIO numbering.

You can usually figure this out from a published schematic, but in
many cases there is no schematic, the schematic is wrong, or the
schematic uses a part number for the chip that does not match what
is actually on the board.

## The pin-announcer technique

The trick:

1. Write firmware that initialises **every GPIO** the chip has as
   an output.
2. For each GPIO, configure a software (bit-bang) UART transmitter.
3. Continuously transmit a string identifying that GPIO — for
   example, the literal text `"PA3\r\n"` on the GPIO that is
   PA3.
4. Flash the firmware to the chip.
5. With a USB-UART adapter set to the same baud rate as your
   bit-bang, probe each physical pin on the board. Whatever string
   you read tells you which GPIO that pin actually is.

The key insights:

* Software UART is trivial — just bit-bang a pre-known sequence.
  No hardware UART required.
* The strings are independent per pin, so you do not need a clock
  reference between pins. Each pin is its own UART.
* You only need one USB-UART adapter; probe pins one at a time.

The whole thing is 200 lines of C and works the same way on every
microcontroller you are likely to encounter.

## A reference implementation: STM32

```c
// pin_announcer.c — STM32F4 example. Compile with arm-none-eabi-gcc.
// Configures every GPIO of every port as bit-bang UART output,
// continuously sending the pin name at 9600 baud.

#include <stdint.h>
#include <stdbool.h>

#define BAUD       9600
#define HCLK_HZ    16000000              // adjust to your clock
#define BIT_TICKS  (HCLK_HZ / BAUD)

static inline void delay_ticks(uint32_t n) {
    uint32_t end = SysTick->VAL - n;     // wraps; works as long as
    while (SysTick->VAL > end) ;         // n < SysTick->LOAD
}

static void enable_all_gpio_clocks(void) {
    RCC->AHB1ENR |= 0xff;                // GPIOA..GPIOH on F4
}

static void cfg_pin_output(GPIO_TypeDef *port, uint8_t pin) {
    port->MODER  &= ~(3u << (pin*2));
    port->MODER  |=  (1u << (pin*2));    // output
    port->OTYPER &= ~(1u << pin);        // push-pull
    port->OSPEEDR |= (3u << (pin*2));    // high speed
    port->ODR    |=  (1u << pin);        // idle high (UART idle = high)
}

static void uart_tx_byte(GPIO_TypeDef *port, uint8_t pin, uint8_t b) {
    // Start bit
    port->BSRR = (1u << (pin + 16));     // pin LOW
    delay_ticks(BIT_TICKS);
    // 8 data bits, LSB first
    for (int i = 0; i < 8; i++) {
        if (b & (1 << i)) port->BSRR = (1u << pin);
        else              port->BSRR = (1u << (pin + 16));
        delay_ticks(BIT_TICKS);
    }
    // Stop bit
    port->BSRR = (1u << pin);            // HIGH
    delay_ticks(BIT_TICKS);
}

static void uart_tx_string(GPIO_TypeDef *port, uint8_t pin,
                           const char *s) {
    while (*s) uart_tx_byte(port, pin, (uint8_t)*s++);
}

static const struct { GPIO_TypeDef *port; char letter; } ports[] = {
    {GPIOA, 'A'}, {GPIOB, 'B'}, {GPIOC, 'C'}, {GPIOD, 'D'},
    {GPIOE, 'E'}, {GPIOF, 'F'}, {GPIOG, 'G'}, {GPIOH, 'H'},
};

int main(void) {
    SysTick->LOAD = 0xffffff;
    SysTick->CTRL = 5;                   // enable, no IRQ, HCLK source
    enable_all_gpio_clocks();
    for (int p = 0; p < 8; p++)
        for (int i = 0; i < 16; i++)
            cfg_pin_output(ports[p].port, i);

    char msg[8];
    while (1) {
        for (int p = 0; p < 8; p++) {
            for (int i = 0; i < 16; i++) {
                msg[0] = 'P';
                msg[1] = ports[p].letter;
                if (i >= 10) {
                    msg[2] = '0' + i/10;
                    msg[3] = '0' + i%10;
                    msg[4] = '\r'; msg[5] = '\n'; msg[6] = 0;
                } else {
                    msg[2] = '0' + i;
                    msg[3] = '\r'; msg[4] = '\n'; msg[5] = 0;
                }
                uart_tx_string(ports[p].port, i, msg);
            }
        }
    }
}
```

::: note
The above is a sketch — it transmits each pin in sequence rather than
in parallel. For pin-announcer firmware, you actually want every pin
to be transmitting *simultaneously*, so that you can probe any pin at
any time. Restructure the inner loop to send one bit at a time across
all pins (interleave bit-banging) rather than one byte at a time per
pin. The SysTick-based delay then sets the bit period for everyone.
:::

## A parallel implementation pattern

The interleaved version's structure:

```c
void uart_tx_byte_all(uint8_t per_pin_byte[8][16]) {
    // for each bit position 0..9 (start, 8 data, stop)
    // for each port × pin
    //   compute the bit value (start=0, data=msb_of_byte, stop=1)
    //   set or clear the pin
    // delay one bit period
}
```

Each pin still emits its own byte; what changes is that all pins
transition together. Probe any pin, you get a stable UART stream
for that pin.

## What you need to probe

* A USB-to-UART adapter (FTDI FT232, CP2102, CH340, …).
* Open `screen /dev/ttyUSB0 9600` (or `picocom`, or `minicom`) at
  the same baud rate as your firmware.
* A logic-analyser is convenient but not required.

Probe procedure:

1. Power the board (probably off USB or external supply).
2. Touch the USB-UART RX line to a pin under test.
3. Read the string. It will be `PA3\r\n` repeating, or `PB12\r\n`,
   or whatever that physical pin is.
4. Note the mapping. Move on.

In practice you can probe a 40-pin board in 10 minutes.

::: warning
Some pins are not safe to probe naively — pins driven by the chip's
internal oscillator, the SWD/JTAG pins (probing them while debug is
attached can wedge the debugger), pins that are tied to power/ground
on the board (these are *not* GPIOs and your firmware should not
have configured them, but if you missed one, the announcer firmware
will fight whatever pulled them). When in doubt, current-limit your
USB-UART RX with a 1k resistor in series.
:::

## Adapting to other architectures

The same technique works on every chip family. The only differences
are:

* **Which GPIO ports exist.** Look up in the chip's reference manual.
* **How GPIOs are configured.** ESP32 uses GPIO matrix + pad config;
  nRF52 uses `NRF_P0->PIN_CNF[N]`; AVR/8051 uses DDR registers;
  RISC-V vendor SoCs each have their own scheme.
* **Where the timing reference comes from.** Cortex-M has SysTick
  (universal). RISC-V has `mtime`. AVR has TIMER0. 8051 has TIMER0
  (different register layout). For chips with no straightforward
  timer, even a calibrated busy-loop is fine — the bit-bang UART
  tolerates ~5% timing error on the receiver side.

For ESP32:

```c
// ESP-IDF style sketch
gpio_config_t io_conf = {
    .mode = GPIO_MODE_OUTPUT,
    .intr_type = GPIO_INTR_DISABLE,
    .pull_down_en = 0,
    .pull_up_en = 0,
};
for (int i = 0; i < 40; i++) {
    if (i == 6 || i == 7 || i == 8 || i == 9 || i == 10 || i == 11)
        continue;     // skip flash pins
    io_conf.pin_bit_mask = (1ULL << i);
    gpio_config(&io_conf);
}
// then bit-bang each GPIO with esp_rom_gpio_pad_select_gpio + GPIO.out_w1ts/out_w1tc
```

For nRF52, similar — `nrf_gpio_cfg_output(pin)` for each pin, then
toggle via `nrf_gpio_pin_set/clear`.

## Variations and refinements

**Encode the chip's pin number, not just the GPIO label.** If you
also know the chip's package layout, send `"PA3 / pin12\r\n"` so the
operator knows both the logical and physical pin in one read.

**Use Morse instead of UART** for very low-speed validation that
works without any test equipment beyond an LED:

```c
// Blink the pin with a Morse-encoded number — visible to the eye
// at 1 Hz, no UART adapter needed.
```

**Send a unique tone instead of UART.** Each pin emits a different
audio frequency square wave. Probe with a piezo speaker or a scope.
Useful for analog techniques where you want to verify pin
connectivity through capacitive coupling without making electrical
contact.

**Send the value of a unique strap pin.** If the board has DIP
switches or jumpers, encode the strap state into the pin announcer's
output so you can verify the firmware is actually running the
correct image on the right board.

**Add a pin-toggle pattern in addition to the string.** Logic
analysers can capture the toggle pattern, and you can recover the
pin identity from the captured trace alone — no UART decode needed.

## Beyond pin discovery

The same technique extends to:

* **Discovering which pin is connected to a specific external
  component.** Configure each pin as input with pull-up; then run
  through them in turn, checking which reads low when you ground a
  test pad on the suspected component. Inverse problem of the
  pin-announcer.
* **Mapping touch electrodes to GPIOs.** Configure each pin as a
  touch sense input; report which one is touched.
* **Discovering crystal-tied pins.** The crystal's two pins have a
  measurable parasitic load that pulls down the chip's internal
  oscillator. Sweep all pins as outputs at high frequency; the two
  that fail to oscillate at full amplitude are the crystal pins.

The principle is the same: use the firmware to broadcast which pin
is which, in a way you can recover externally. Once you have the
map, you can stop guessing.

## What this gives you for reverse engineering

Pin discovery is upstream of firmware reversing in two ways:

1. **You can connect a UART/SWD/JTAG.** You probably bought the
   board to flash it or read its existing firmware; you cannot do
   either without knowing which physical pin is SWDIO and which is
   SWCLK, or where the UART RX/TX pins are. Pin announcer first;
   debugger and bootloader interaction second.

2. **You can correlate firmware GPIO references with physical
   behaviour.** When you read disassembly that writes to
   `GPIOA->ODR` bit 5, you now know that bit 5 corresponds to a
   specific physical pin and (probably) a specific board feature
   wired to that pin (LED, button, sensor enable line). Without the
   physical mapping, the firmware references are abstract.

The whole pinout exercise takes a couple of hours per new board the
first time. After you have done it once, you have a script you can
adapt for the next board in 20 minutes. It is one of the cheapest
investments in embedded reverse engineering work that pays back
across every subsequent project on the same hardware.
