# Books are never merged across Profiles

When two Profiles add the same work (even byte-identical Files), each gets its own Book with its own metadata, Shares and reading state. Merging them, or warning "Alice already has this", would tell Bob what is in Alice's private library. That breaks the rule that Books are private until Shared. Duplicates are the accepted cost: a Recipient can end up seeing two *Dune* Books, their own and a Shared one, and can hide either. Deduplicating File bytes on disk is still allowed, because it is invisible to Profiles.
