-- Map fenced divs ::: note / warning / tip / caution to LaTeX tcolorbox environments
local box_for = {
  note    = "notebox",
  warning = "warnbox",
  warn    = "warnbox",
  tip     = "tipbox",
  caution = "cautionbox",
}

function Div(el)
  for _, cls in ipairs(el.classes) do
    local env = box_for[cls:lower()]
    if env then
      return {
        pandoc.RawBlock("latex", "\\begin{" .. env .. "}"),
        el,
        pandoc.RawBlock("latex", "\\end{" .. env .. "}"),
      }
    end
  end
  return nil
end
