import{c as a,Q as n,j as e,m as p}from"./chunks/framework.DxgWTcNC.js";const m=JSON.parse('{"title":"Command Cheatsheet","description":"","frontmatter":{},"headers":[],"relativePath":"appendix/A-cheatsheet.md","filePath":"appendix/A-cheatsheet.md","lastUpdated":null}'),l={name:"appendix/A-cheatsheet.md"};function i(t,s,c,r,o,d){return n(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="command-cheatsheet" tabindex="-1">Command Cheatsheet <a class="header-anchor" href="#command-cheatsheet" aria-label="Permalink to &quot;Command Cheatsheet&quot;">​</a></h1><p>Commands grouped by task. Most have variants (<code>j</code> for JSON, <code>q</code> for quiet, <code>*</code> for replayable form); see the relevant chapter.</p><h2 id="loading" tabindex="-1">Loading <a class="header-anchor" href="#loading" aria-label="Permalink to &quot;Loading&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>r2 file                               # ELF/Mach-O/PE: just open it</span></span>
<span class="line"><span>r2 -a arm -b 16 -m 0x08000000 file    # raw blob</span></span>
<span class="line"><span>r2 -a mips -b 32 -e cfg.bigendian=true -m 0x80000000 file</span></span>
<span class="line"><span>r2 -p projectname                     # reopen saved project</span></span>
<span class="line"><span>r2 -i load.r2 -                       # run script then enter prompt</span></span>
<span class="line"><span>r2 -d gdb://host:port [file]          # attach to GDB remote</span></span>
<span class="line"><span>r2 -w file                            # open writable</span></span>
<span class="line"><span>o file 0xADDR                         # add additional mapping</span></span>
<span class="line"><span>o                                     # list open files / mappings</span></span>
<span class="line"><span>o-N                                   # close mapping N</span></span>
<span class="line"><span>oo+                                   # reopen current file rw</span></span>
<span class="line"><span>i                                     # binary info</span></span>
<span class="line"><span>iI                                    # detailed info</span></span>
<span class="line"><span>iS                                    # sections</span></span>
<span class="line"><span>iSS                                   # segments (program headers)</span></span>
<span class="line"><span>iE                                    # exports</span></span>
<span class="line"><span>ii                                    # imports</span></span>
<span class="line"><span>is                                    # symbols</span></span>
<span class="line"><span>iL                                    # libraries</span></span>
<span class="line"><span>iz                                    # strings in data sections</span></span>
<span class="line"><span>izz                                   # strings everywhere in file</span></span>
<span class="line"><span>izzz                                  # strings of any encoding</span></span></code></pre></div><h2 id="analysis" tabindex="-1">Analysis <a class="header-anchor" href="#analysis" aria-label="Permalink to &quot;Analysis&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>aaa                                   # standard analysis</span></span>
<span class="line"><span>aaaa                                  # + experimental passes</span></span>
<span class="line"><span>aaaaa                                 # everything (slow)</span></span>
<span class="line"><span>af @ addr                             # define function</span></span>
<span class="line"><span>af-                                   # delete function</span></span>
<span class="line"><span>afn name                              # rename function</span></span>
<span class="line"><span>afr @ addr                            # analyse + recurse into callees</span></span>
<span class="line"><span>afi                                   # function info</span></span>
<span class="line"><span>afl                                   # list functions</span></span>
<span class="line"><span>aflj                                  # list functions as JSON</span></span>
<span class="line"><span>aflq                                  # list functions, quiet</span></span>
<span class="line"><span>aflc                                  # list with call counts</span></span>
<span class="line"><span>aar                                   # analyse references</span></span>
<span class="line"><span>aac                                   # analyse calls</span></span>
<span class="line"><span>aap                                   # find functions by prelude</span></span>
<span class="line"><span>aae                                   # analyse via ESIL</span></span>
<span class="line"><span>afta                                  # propagate types</span></span>
<span class="line"><span>afv                                   # list local variables</span></span>
<span class="line"><span>afvn newname oldname                  # rename variable</span></span>
<span class="line"><span>afvt name &quot;type&quot;                      # type a variable</span></span>
<span class="line"><span>afs sig                               # set function signature</span></span>
<span class="line"><span>afS sig                               # set signature (alt syntax)</span></span>
<span class="line"><span>afc cc                                # set calling convention</span></span>
<span class="line"><span>afcl                                  # list calling conventions</span></span></code></pre></div><h2 id="navigation" tabindex="-1">Navigation <a class="header-anchor" href="#navigation" aria-label="Permalink to &quot;Navigation&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>s addr                                # seek</span></span>
<span class="line"><span>s+                                    # seek forward</span></span>
<span class="line"><span>s-                                    # seek back</span></span>
<span class="line"><span>sf                                    # seek to next function</span></span>
<span class="line"><span>sb                                    # seek to previous block</span></span>
<span class="line"><span>b N                                   # set block size to N bytes</span></span>
<span class="line"><span>?v expression                         # evaluate expression value</span></span>
<span class="line"><span>?  expression                         # evaluate, multiple bases</span></span>
<span class="line"><span>$$                                    # current seek</span></span>
<span class="line"><span>$F                                    # current function start</span></span>
<span class="line"><span>$FE                                   # current function end</span></span>
<span class="line"><span>@ addr                                # temporary seek (per-command)</span></span>
<span class="line"><span>@@= a b c                             # iterate over explicit list</span></span>
<span class="line"><span>@@ glob                               # iterate over flags matching glob</span></span>
<span class="line"><span>@@i                                   # iterate over imports</span></span>
<span class="line"><span>@@f                                   # iterate over functions</span></span>
<span class="line"><span>@@@F                                  # iterate scope: every function</span></span>
<span class="line"><span>@@@s                                  # every string</span></span>
<span class="line"><span>@@@i                                  # every import</span></span>
<span class="line"><span>@@@?                                  # list scope iterators</span></span></code></pre></div><h2 id="disassembly-and-printing" tabindex="-1">Disassembly and printing <a class="header-anchor" href="#disassembly-and-printing" aria-label="Permalink to &quot;Disassembly and printing&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>pd N                                  # N instructions</span></span>
<span class="line"><span>pd N @ addr                           # N instructions at addr</span></span>
<span class="line"><span>pdf @ addr                            # disassembly of a function</span></span>
<span class="line"><span>pdb                                   # disassembly of basic block</span></span>
<span class="line"><span>pdr                                   # recursive disassembly</span></span>
<span class="line"><span>pdj                                   # disassembly as JSON</span></span>
<span class="line"><span>pds                                   # disassembly summary</span></span>
<span class="line"><span>pdg @ addr                            # decompiled C (r2ghidra)</span></span>
<span class="line"><span>pdd @ addr                            # decompiled (r2dec)</span></span>
<span class="line"><span>pdgs                                  # decompile + asm side-by-side</span></span>
<span class="line"><span>px N                                  # N bytes of hex</span></span>
<span class="line"><span>pxw N                                 # N bytes as 32-bit words</span></span>
<span class="line"><span>pxq N                                 # N bytes as 64-bit words</span></span>
<span class="line"><span>pxr                                   # words + ref resolution</span></span>
<span class="line"><span>ps                                    # string at cursor</span></span>
<span class="line"><span>psz                                   # zero-terminated string</span></span>
<span class="line"><span>psw                                   # wide string (UTF-16)</span></span>
<span class="line"><span>psp                                   # Pascal string</span></span></code></pre></div><h2 id="cross-references" tabindex="-1">Cross-references <a class="header-anchor" href="#cross-references" aria-label="Permalink to &quot;Cross-references&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>ax                                    # all xrefs</span></span>
<span class="line"><span>axt @ addr                            # who points here?</span></span>
<span class="line"><span>axf @ addr                            # what does here point to?</span></span>
<span class="line"><span>axg @ addr                            # graph</span></span>
<span class="line"><span>ax addr1 addr2                        # add xref</span></span>
<span class="line"><span>ax-                                   # delete xref</span></span>
<span class="line"><span>aex addr                              # ESIL-trace xrefs</span></span></code></pre></div><h2 id="strings-comments-flags" tabindex="-1">Strings, comments, flags <a class="header-anchor" href="#strings-comments-flags" aria-label="Permalink to &quot;Strings, comments, flags&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>f                                     # list flags</span></span>
<span class="line"><span>f name = addr                         # add flag</span></span>
<span class="line"><span>f-name                                # delete flag</span></span>
<span class="line"><span>fr oldname newname                    # rename flag</span></span>
<span class="line"><span>fs space                              # switch flag space</span></span>
<span class="line"><span>fs                                    # list flag spaces</span></span>
<span class="line"><span>CC &quot;comment&quot; @ addr                   # add comment</span></span>
<span class="line"><span>CC- @ addr                            # delete comment</span></span>
<span class="line"><span>CCa addr,comment                      # alt form</span></span>
<span class="line"><span>Cd N @ addr                           # mark N bytes as data</span></span>
<span class="line"><span>Cs N @ addr                           # mark as string</span></span>
<span class="line"><span>Cf &quot;type&quot; @ addr                      # mark as struct</span></span></code></pre></div><h2 id="types" tabindex="-1">Types <a class="header-anchor" href="#types" aria-label="Permalink to &quot;Types&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>t                                     # list types</span></span>
<span class="line"><span>to file                               # parse C header file</span></span>
<span class="line"><span>tos &quot;C source&quot;                        # parse inline C</span></span>
<span class="line"><span>tc                                    # print all types as C</span></span>
<span class="line"><span>tc name                               # one type as C</span></span>
<span class="line"><span>tp typename @ addr                    # print as struct at addr</span></span>
<span class="line"><span>tl typename = addr                    # link a type to an address</span></span>
<span class="line"><span>tk type=name                          # set raw SDB key</span></span>
<span class="line"><span>te                                    # enum operations</span></span>
<span class="line"><span>tu                                    # union operations</span></span>
<span class="line"><span>ts                                    # struct operations</span></span></code></pre></div><h2 id="hints" tabindex="-1">Hints <a class="header-anchor" href="#hints" aria-label="Permalink to &quot;Hints&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>ah                                    # list hints</span></span>
<span class="line"><span>ah-                                   # delete a hint</span></span>
<span class="line"><span>ah-*                                  # delete all hints</span></span>
<span class="line"><span>ahb 16 @ addr                         # bits at address (Thumb)</span></span>
<span class="line"><span>ahb 32 @ addr                         # bits at address (ARM)</span></span>
<span class="line"><span>aha mov @ addr                        # force decode as mnemonic</span></span>
<span class="line"><span>aho ret @ addr                        # set instruction type</span></span>
<span class="line"><span>ahi h @ addr                          # display immediate as hex</span></span>
<span class="line"><span>ahi 10 @ addr                         # as decimal</span></span>
<span class="line"><span>ahi b @ addr                          # as binary</span></span>
<span class="line"><span>ahd &quot;label&quot; @ addr                    # custom label for address</span></span>
<span class="line"><span>ahS .text @ addr                      # syntax variant</span></span>
<span class="line"><span>ahf @ addr                            # this is a function</span></span>
<span class="line"><span>ahc addr @ caller                     # call destination override</span></span></code></pre></div><h2 id="search" tabindex="-1">Search <a class="header-anchor" href="#search" aria-label="Permalink to &quot;Search&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>/ string                              # search for string</span></span>
<span class="line"><span>/x deadbeef                           # search for hex bytes</span></span>
<span class="line"><span>/v 0x12345678                         # search for 4-byte value</span></span>
<span class="line"><span>/V begin end                          # search for value range</span></span>
<span class="line"><span>/c push                               # search disassembly text</span></span>
<span class="line"><span>/a mov                                # search by mnemonic</span></span>
<span class="line"><span>/A mov                                # by mnemonic family</span></span>
<span class="line"><span>/m magic                              # magic / format pattern</span></span>
<span class="line"><span>/r main                               # references to symbol</span></span>
<span class="line"><span>/z 4 32                               # strings length 4..32</span></span>
<span class="line"><span>e search.in = io.maps                 # restrict search</span></span></code></pre></div><h2 id="configuration-e-vars" tabindex="-1">Configuration (e-vars) <a class="header-anchor" href="#configuration-e-vars" aria-label="Permalink to &quot;Configuration (e-vars)&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>e var                                 # show value</span></span>
<span class="line"><span>e var = value                         # set</span></span>
<span class="line"><span>e var?                                # help</span></span>
<span class="line"><span>e foo.~                               # list matching &quot;foo.&quot;</span></span>
<span class="line"><span>e?                                    # all configuration help</span></span>
<span class="line"><span>ec scheme                             # color scheme</span></span>
<span class="line"><span>eco                                   # list color schemes</span></span>
<span class="line"><span>e scr.color = 3                       # 256-color</span></span>
<span class="line"><span>e asm.bytes = false                   # hide bytes column</span></span>
<span class="line"><span>e asm.cmt.right = true                # comments to the right</span></span>
<span class="line"><span>e asm.cmt.col = 60                    # comment column</span></span>
<span class="line"><span>e anal.depth = 64                     # call recursion depth</span></span>
<span class="line"><span>e anal.cc = arm32                     # default calling convention</span></span>
<span class="line"><span>e cfg.bigendian = true                # endianness</span></span></code></pre></div><h2 id="visual-mode" tabindex="-1">Visual mode <a class="header-anchor" href="#visual-mode" aria-label="Permalink to &quot;Visual mode&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>V                                     # enter visual disasm</span></span>
<span class="line"><span>v                                     # enter panels mode</span></span>
<span class="line"><span>VV                                    # graph view (or V V)</span></span>
<span class="line"><span>:                                     # command prompt while visual</span></span>
<span class="line"><span>;                                     # add comment</span></span>
<span class="line"><span>d                                     # define cursor (function/string/data)</span></span>
<span class="line"><span>df                                    # define function</span></span>
<span class="line"><span>dr                                    # rename function</span></span>
<span class="line"><span>dc                                    # edit calling convention</span></span>
<span class="line"><span>f                                     # add a flag</span></span>
<span class="line"><span>g                                     # go to address</span></span>
<span class="line"><span>n / N                                 # next / previous function</span></span>
<span class="line"><span>b                                     # back in seek history</span></span>
<span class="line"><span>x                                     # xrefs to current function</span></span>
<span class="line"><span>X                                     # xrefs from current address</span></span>
<span class="line"><span>/ ?                                   # search / help</span></span>
<span class="line"><span>p / P                                 # cycle views forward/back</span></span>
<span class="line"><span>q                                     # quit visual</span></span></code></pre></div><h2 id="debugging" tabindex="-1">Debugging <a class="header-anchor" href="#debugging" aria-label="Permalink to &quot;Debugging&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>ds                                    # step</span></span>
<span class="line"><span>dso                                   # step over</span></span>
<span class="line"><span>dsu addr                              # step until</span></span>
<span class="line"><span>dc                                    # continue</span></span>
<span class="line"><span>dr                                    # registers</span></span>
<span class="line"><span>dr name                               # one register</span></span>
<span class="line"><span>dr name=value                         # set register</span></span>
<span class="line"><span>dm                                    # memory map</span></span>
<span class="line"><span>db addr                               # software breakpoint</span></span>
<span class="line"><span>dbh addr                              # hardware breakpoint</span></span>
<span class="line"><span>dbw addr N rw                         # watchpoint (size N, mode rw)</span></span>
<span class="line"><span>db                                    # list breakpoints</span></span>
<span class="line"><span>db- addr                              # delete one</span></span>
<span class="line"><span>db-*                                  # delete all</span></span>
<span class="line"><span>dts+ on / off                         # tracing start/stop</span></span>
<span class="line"><span>dx hex                                # execute raw bytes</span></span></code></pre></div><h2 id="esil-emulation" tabindex="-1">ESIL emulation <a class="header-anchor" href="#esil-emulation" aria-label="Permalink to &quot;ESIL emulation&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>aei                                   # init ESIL VM</span></span>
<span class="line"><span>aeim                                  # init memory</span></span>
<span class="line"><span>aeip                                  # set ESIL PC</span></span>
<span class="line"><span>aer                                   # ESIL registers</span></span>
<span class="line"><span>aer name                              # one register</span></span>
<span class="line"><span>aer name=value                        # set</span></span>
<span class="line"><span>aes                                   # one step</span></span>
<span class="line"><span>aeso                                  # step over</span></span>
<span class="line"><span>aess N                                # N steps</span></span>
<span class="line"><span>aesu addr                             # step until</span></span>
<span class="line"><span>aef                                   # emulate current function</span></span>
<span class="line"><span>aeh r addr value                      # hook reads</span></span></code></pre></div><h2 id="patching" tabindex="-1">Patching <a class="header-anchor" href="#patching" aria-label="Permalink to &quot;Patching&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>oo+                                   # writable session</span></span>
<span class="line"><span>wx hex                                # write hex bytes</span></span>
<span class="line"><span>w str                                 # write string</span></span>
<span class="line"><span>wz str                                # write null-terminated string</span></span>
<span class="line"><span>wa &quot;asm&quot;                              # assemble &amp; write</span></span>
<span class="line"><span>waf file                              # assemble &amp; write from file</span></span>
<span class="line"><span>wo* args                              # ops (xor, and, or, add, sub)</span></span>
<span class="line"><span>wb pattern                            # write a byte pattern (cycles \`pattern\` across the current block size; set with \`b N\`)</span></span>
<span class="line"><span>wn N value                            # write N-byte int</span></span>
<span class="line"><span>wv value                              # write 32-bit</span></span>
<span class="line"><span>wf path                               # write file at cursor</span></span>
<span class="line"><span>wt path N                             # write N bytes from cursor to file</span></span>
<span class="line"><span>wB val                                # bit operations</span></span>
<span class="line"><span>wc                                    # write cache list</span></span>
<span class="line"><span>wcr                                   # revert all cached writes</span></span>
<span class="line"><span>wB                                    # commit cache to file</span></span></code></pre></div><h2 id="projects" tabindex="-1">Projects <a class="header-anchor" href="#projects" aria-label="Permalink to &quot;Projects&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>P                                     # project commands</span></span>
<span class="line"><span>Ps name                               # save project</span></span>
<span class="line"><span>P name                                # open project (r2 ≥ 5.9; older \`Po name\` still works but is deprecated)</span></span>
<span class="line"><span>P+                                    # save with current name</span></span>
<span class="line"><span>P-                                    # delete project</span></span>
<span class="line"><span>P*                                    # export project as r2 commands</span></span>
<span class="line"><span>Pn                                    # project notes</span></span></code></pre></div><h2 id="zignatures-flirt-like" tabindex="-1">Zignatures (FLIRT-like) <a class="header-anchor" href="#zignatures-flirt-like" aria-label="Permalink to &quot;Zignatures (FLIRT-like)&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>z                                     # list loaded zigs</span></span>
<span class="line"><span>z. @ addr                             # zigs matching current function</span></span>
<span class="line"><span>zb                                    # best matches</span></span>
<span class="line"><span>zg                                    # generate for current function</span></span>
<span class="line"><span>zg @@f                                # generate for every function</span></span>
<span class="line"><span>zo file.sdb                           # save / load</span></span>
<span class="line"><span>z/                                    # search and apply matches</span></span>
<span class="line"><span>zs                                    # list spaces</span></span>
<span class="line"><span>e zign.threshold = 0.9                # match threshold</span></span>
<span class="line"><span>e zign.minsz = 0x20                   # minimum function size</span></span></code></pre></div><h2 id="help" tabindex="-1">Help <a class="header-anchor" href="#help" aria-label="Permalink to &quot;Help&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>?                                     # top-level help</span></span>
<span class="line"><span>&lt;cmd&gt;?                                # subcommand help (any level)</span></span>
<span class="line"><span>?*~kw                                 # search command tree for keyword</span></span>
<span class="line"><span>?V                                    # version info</span></span>
<span class="line"><span>?t cmd                                # command timing</span></span></code></pre></div><h2 id="shell" tabindex="-1">Shell <a class="header-anchor" href="#shell" aria-label="Permalink to &quot;Shell&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>!cmd                                  # run shell command</span></span>
<span class="line"><span>!!cmd                                 # passthrough exec (no stdin/stdout intercept)</span></span>
<span class="line"><span>.cmd                                  # interpret command output as r2 cmds</span></span>
<span class="line"><span>.!cmd                                 # interpret shell output as r2 cmds</span></span>
<span class="line"><span>.script.r2                            # run r2 script</span></span>
<span class="line"><span>.script.py                            # run Python script via rlang</span></span>
<span class="line"><span>| cmd                                 # pipe r2 output to shell</span></span>
<span class="line"><span>&gt; file                                # redirect r2 output to file</span></span>
<span class="line"><span>~ pattern                             # internal grep</span></span>
<span class="line"><span>~!pattern                             # negate grep</span></span>
<span class="line"><span>~ pattern[N]                          # column N of matching lines</span></span></code></pre></div><h2 id="quitting" tabindex="-1">Quitting <a class="header-anchor" href="#quitting" aria-label="Permalink to &quot;Quitting&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark-dimmed vp-code" tabindex="0"><code><span class="line"><span>q                                     # quit</span></span>
<span class="line"><span>qq                                    # quit without saving</span></span>
<span class="line"><span>q!                                    # quit, even if dirty</span></span></code></pre></div>`,40)])])}const u=a(l,[["render",i]]);export{m as __pageData,u as default};
