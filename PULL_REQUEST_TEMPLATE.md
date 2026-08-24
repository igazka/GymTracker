## 📝 Summary
Briefly describe the changes, bug fixes, or new features included in this PR.

---

## ⚙️ Type of Change
- [ ] 🐛 Bug fix (non-breaking change fixing an issue)
- [ ] ✨ New feature (non-breaking change adding functionality)
- [ ] 🚨 Breaking change (fix or feature causing existing features to break)
- [ ] 🧹 Code refactoring or performance optimization
- [ ] 📚 Documentation update

---

## 🧪 Testing & Verification
All PRs **must** be tested across multiple Pebble platforms in CloudPebble or on physical hardware before submission.

### Platforms Tested
- [ ] **Basalt** (Pebble Time)
- [ ] **Emery** (Pebble Time 2)
- [ ] **Chalk** (Pebble Time Round)
- [ ] **Diorite** (Pebble 2 HR)

### Testing Checklist
- [ ] Verified app builds cleanly with zero compiler warnings/errors (`-Werror`).
- [ ] Checked app logs for memory usage and verified there are **no memory leaks** or stack overflows (`Still allocated <0B>`).
- [ ] Verified Bluetooth message inbox/outbox buffer sizes do not starve heap RAM on 64KB devices (Basalt).
- [ ] Screenshots or emulator logs attached as proof of testing below.

---

## 📸 Proof of Testing (Screenshots / Logs)
> *Please attach screenshots of the feature running in CloudPebble/Hardware or paste relevant build logs.*

---

## 🤖 AI / LLM Code Disclosure
- Was an AI assistant (e.g., Claude, ChatGPT, Copilot) used to generate any part of this code?
  - [ ] Yes
  - [ ] No
- *If Yes:* I confirm that I have manually audited the generated C code for:
  - [ ] Array bounds checks and array buffer overflow prevention
  - [ ] Pointer null checks and memory leaks
  - [ ] Divide-by-zero protection

---

## 🔗 Related Issues
Closes #
