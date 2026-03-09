# Thoughtboard — Friction Log

This document tracks friction points encountered while building Thoughtboard using Cloudflare's Developer Platform.

> Format follows the assignment spec: Title → Problem → Suggestion

---

## Friction Points

### 1. [MCP Installation]
- **Problem:** When installing the Cloudflare API MCP server, the documentation in developers.cloudflare.com is confusing. The wording is inconsistent and makes it seem as it is a process: "Connect to the Cloudflare API MCP Server", then "Install via agent and IDE plugins". I was not sure what to do and thought that I had to first connect then install. It surprised me as well, because when I tried to connect using the JSON, Claude Code flagged a config error. I had to resort to asking Claude what the documentation meant. It didn't considerably slow me down (about 20 minutes, as I tried to solve by myself first) but this friction might cause people to just skip the connection entirely, which might impact the ability of the agent to understand Cloudflare documentation, which can lead to a worse architecture/user experience.  
- **Suggestion:** Two quick and easy fixes resolve this issue: 1- Make wording consistent (Connect x Install) to remove confusion; 2- Add a decision-tree summary to guide the user on top (e.g. "To install the MCP servers, there are several options. Using an MCP Client? -Go to section-. Using Claude Code or Windsurf? -Go to section-). By directing the user straight to the method that suits their condition better, we are able to reduce time to setup and drop-off

### 2. [MCP Silent Failure]
- **Problem:** After (tecnically) installing the MCP, I thought everything was ok (did a small documentation check using Claude Code) and started to build. However, we faced some bugs that took a long time to solve and even ended having one of the products we had planned initially (Workflows) just as scaffolding rather than an active component. By the end of the build, when installing Claude's frontend design plugin, I noticed that Cloudflare's skills were not active. The marketplace was there, but no skills had been installed (so no practical benefit in having the MCP) and the documentation only had the first step (marketplace install). Estimated impact of 1.5 hours in AI debugging and building alternative pipeline architectures. In the end, Claude Code found an alternate way to solve things, albeit suboptimal, due to this silent failure.
- **Suggestion:** Two things could have been done: 1- Include the Skill installation in the documentation, to guarantee new users won't face discoverability issues; 2- Create a check for the MCP installation and skill. It should provide a visual signal in a dashboard (Cloudflare, Github...) as well as auto-run a small test with the user once installed to show that it is working properly.

### 3. [Workflow Processing Limits and Alternatives]
- **Problem:** When processing the raw data into Workflow, we ran into a substantial drawback in the form of too many subrequests. While the free plan is limited to 50, this error started showing with about 30-40 of them. The error message was also not very helpful, "Too many subrequests". Claude Code was also confused on the way subrequests were being tracked (instance level vs. per-step). These details led Claude to re-architect the pipeline 4 times and spend much more time (~1.5h total) and tokens than needed. Even though there was some hint of the correct batching method in the documentation ("Punderful"), Claude Code couldn't find it and Workflow ended up as just a scaffolding element, as an alternate solution was found using an HTTP endpoint (with the correct batching method)
- **Suggestion:** Two things could be done: 1- Enrich the error message to include the subrequest limit, usage count, alternate solutions and a link to the documentation (e.g. "Too many subrequests: 50/50 used (Free plan). Increase limit or use multiple instances. See docs: [link]"); 2- Include subrequests and other limiting criteria in the Workflow Cloudflare dashboard. This would allow for the user to understand their usage and incentivize conversion to a paid plan.

### 4. [D1 Local Server Instance]
- **Problem:** When testing the dashboard in the local server, it appeared empty at first, with no data, even though in theory the pipeline had run successfully and the data was ready. While debugging, we found out that wrangler dev start out empty, which had us rerun the whole pipeline for the local server. This cost us ~30min in build time, plus breaking over the free plan's Workers AI daily neuron limit. Later we understoon that the best solution would be to deploy and test in production, where the data was ready.
- **Suggestion:** Two main fixes: 1- When D1 is included in the Worker being deployed locally, request for a clone of the data to be deployed; 2- In D1's interface in the Cloudflare dashboard, add a map the existing tables and where they have active instances/when the instances were created. This would make it easier for the user to track their data architecture and instances 

### 5. [Title]
- **Problem:**
- **Suggestion:**

---

## Notes
- Some friction points documented here may become less relevant as AI-assisted development tools (Claude Code, Codex, etc.) mature — which itself raises interesting product questions about documentation audience and developer onboarding strategy.
