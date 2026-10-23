## Anchor 1.0.1

A fix for Tech Spotlight's Videos tab.

### Fixes

- **Videos no longer go blank when YouTube's feeds fail.** YouTube's video feeds have been failing on and off for many channels. Anchor used to treat that as "no videos" and empty the tab. Now a channel that doesn't answer keeps showing its last videos, and if YouTube doesn't answer at all, you keep the videos you already had.
- **A clear message when there's nothing to show.** If YouTube isn't responding and Anchor has no videos saved yet, the tab says so, instead of telling you to press Refresh.
