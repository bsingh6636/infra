# 🔒 Private Repository Builds

This guide explains how to build Docker images in this infrastructure when the source code is in a **private GitHub repository**.

---

## 🚀 The Problem
By default, Docker `buildx` runs in an isolated environment. If your `build.sh` script tries to pull a private repository (like `bae-portfolio`), Docker won't have access to your computer's SSH keys, resulting in a `Permission denied (publickey)` error.

## ✅ The Solution: SSH Agent Forwarding
We use **SSH Agent Forwarding** to securely "pass" your local SSH connection into the Docker build process without copying your private keys into the image.

### 1. Configure the Script
The `build.sh` script is already configured to support this. It uses:
1.  **SSH URLs**: The image context must use the SSH format: `git@github.com:user/repo.git`.
2.  **SSH Flag**: The `docker buildx build` command includes the `--ssh default` flag.

### 2. Local Setup (One-Time per session)
Before running the build script, you must ensure your SSH key is loaded into your local SSH agent.

```bash
# 1. Start or check the agent
ssh-add -l

# 2. If you see "The agent has no identities", add your key:
ssh-add

# 3. If you use a custom key location:
# ssh-add ~/.ssh/id_rsa
```

### 3. Run the Build
Now you can run the build normally:
```bash
./build.sh bae-portfolio
```

---

## ❓ Troubleshooting

### "Permission denied (publickey)"
- Check if your key is added: `ssh-add -l`
- Check if you can connect to GitHub: `ssh -T git@github.com`
- Verify the repository URL in `build.sh` uses the SSH format (`git@github.com:...`) and NOT HTTPS.

### "terminal prompts disabled" (HTTPS Error)
If you see this error, it means the URL in `build.sh` is still set to HTTPS. Private repositories require SSH or a Token. We recommend sticking with the SSH setup described above.
