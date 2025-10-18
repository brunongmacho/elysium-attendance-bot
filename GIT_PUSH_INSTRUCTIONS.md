# Quick push troubleshooting

1. See current status:
   - git status
2. If node_modules was accidentally added:
   - git rm -r --cached node_modules
   - add node_modules/ to .gitignore
   - git add .gitignore
   - git commit -m "Remove node_modules and ignore it"
   - git push origin main
3. If push fails with "file exceeds 100MB":
   - git rm --cached path/to/largefile
   - git commit -m "Remove large file"
   - git push origin main
   - To remove from history permanently, use BFG or git filter-branch / git filter-repo.
4. If authentication fails:
   - Ensure you have correct credentials (PAT for HTTPS or SSH key set up).
   - For GitHub recommend using a Personal Access Token for HTTPS or SSH keys.
5. Use push.cmd in the repo root to run a simple commit+push helper:
   - Double-click push.cmd or run it from cmd.exe in repository folder.

If you run git push and still get an error, copy the exact error text here and I will advise the next steps.
