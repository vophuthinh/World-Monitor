# CLAUDE.md

Project context for AI agents lives in [AGENTS.md](./AGENTS.md). Read it first.

## Skill routing (gstack)

When a request matches one of these, invoke the skill with the Skill tool instead of answering ad hoc:

- Bug, error, "why is this broken" → `/investigate`
- Review my changes / diff / PR → `/review`
- Ship, push, create a PR → `/ship`
- Test the site, find bugs → `/qa` (report only: `/qa-only`)
- Security audit, vulnerabilities → `/cso`
- Visual polish of the live UI → `/design-review`
- Update docs after shipping → `/document-release`
- Save or resume work → `/context-save`, `/context-restore`
- Weekly retro → `/retro`
