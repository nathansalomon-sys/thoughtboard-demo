# Thoughtboard — Friction Log

This document tracks friction points encountered while building Thoughtboard using Cloudflare's Developer Platform.

> Format follows the assignment spec: Title → Problem → Suggestion

---

## Friction Points

### 1. [MCP Installation]
- **Problem:** When installing the Cloudflare API MCP server, the documentation in developers.cloudflare.com is confusing. The wording is inconsistent and makes it seem as it is a process: "Connect to the Cloudflare API MCP Server", then "Install via agent and IDE plugins". I was not sure what to do and thought that I had to first connect then install. It surprised me as well, because when I tried to connect using the JSON, Claude Code flagged a config error. I had to resort to asking Claude what the documentation meant. It didn't considerably slow me down (about 20 minutes, as I tried to solve by myself first) but this friction might cause people to just skip the connection entirely, which might impact the ability of the agent to understand Cloudflare documentation, which can lead to a worse architecture/user experience.  
- **Suggestion:** Two quick and easy fixes resolve this issue: 1- Make wording consistent (Connect x Install) to remove confusion; 2- Add a decision-tree summary to guide the user on top (e.g. "To install the MCP servers, there are several options. Using an MCP Client? -Go to section-. Using Claude Code or Windsurf? -Go to section-). By directing the user straight to the method that suits their condition better, we are able to reduce time to setup and drop-off

### 2. [Title]
- **Problem:**
- **Suggestion:**

### 3. [Title]
- **Problem:**
- **Suggestion:**

### 4. [Title]
- **Problem:**
- **Suggestion:**

### 5. [Title]
- **Problem:**
- **Suggestion:**

---

## Notes
- Some friction points documented here may become less relevant as AI-assisted development tools (Claude Code, Codex, etc.) mature — which itself raises interesting product questions about documentation audience and developer onboarding strategy.
