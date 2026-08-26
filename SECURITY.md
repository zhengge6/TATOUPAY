# Security

Do not file public issues that contain private keys, V1 keys, BEpusdt tokens, or `.master-key`.

Report privately to the repository owner on GitHub.

This process stores amounts as integer cents and encrypts Alipay/V1/V2/BEpusdt/V免签 secrets with AES-256-GCM. Rotating `APP_MASTER_KEY` or deleting `data/.master-key` makes existing ciphertext unreadable.

Callbacks refuse private networks unless `ALLOW_PRIVATE_CALLBACKS=true`. That flag is for lab use only.
