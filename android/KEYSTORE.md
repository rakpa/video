# Android release signing

The release workflow builds `com.paperly.scanner` as an Android App Bundle.

## Create a keystore

```bash
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias upload
```

## Add GitHub Actions secrets

Base64 encode the keystore:

```bash
base64 -w 0 upload-keystore.jks
```

Add these repository secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | Base64 output for `upload-keystore.jks` |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias, for example `upload` |
| `KEY_PASSWORD` | Key password |

The workflow writes `android/key.properties` and
`android/app/upload-keystore.jks` at build time. Both paths are git-ignored.
