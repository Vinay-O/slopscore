# Reproducible demo recording for slopscore.
# Renders the README hero GIF with charmbracelet/vhs (https://github.com/charmbracelet/vhs):
#
#   brew install vhs            # or: go install github.com/charmbracelet/vhs@latest
#   vhs docs/demo.tape          # writes docs/demo.gif
#
# Keep this in sync with the README "See it work" block.

Output docs/demo.gif

Set FontSize 18
Set Width 1100
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"

Type "npx slopscore examples/slop.tsx"
Sleep 600ms
Enter
Sleep 3s

Type "# a clean file scores 0 — slopscore passes its own scan"
Sleep 800ms
Enter
Type "npm run selfcheck"
Sleep 600ms
Enter
Sleep 3s
