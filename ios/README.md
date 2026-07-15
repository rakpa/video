# Paperly iOS release from Windows

Paperly builds on GitHub Actions macOS runners. You can prepare signing assets
from Windows, add them as repository secrets, then run the **iOS Release**
workflow.

- Bundle ID: `com.paperly.scanner`
- Display name: Paperly

## 1. Register the app

In Apple Developer:

1. Certificates, Identifiers & Profiles -> Identifiers -> register an App ID.
2. Bundle ID: `com.paperly.scanner`.
3. App Store Connect -> Apps -> New App -> choose that Bundle ID.

## 2. Create an App Store Connect API key

App Store Connect -> Users and Access -> Integrations -> App Store Connect API:

1. Create a key with App Manager access.
2. Save Key ID and Issuer ID.
3. Download the `.p8` file once.
4. Base64 encode it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_ABC123.p8"))
```

## 3. Create a signing certificate request on Windows

Use OpenSSL:

```powershell
openssl genrsa -out paperly_dist.key 2048
openssl req -new -key paperly_dist.key -out paperly_dist.csr -subj "/CN=Paperly iOS Distribution/O=Your Name/C=US"
```

Apple Developer -> Certificates -> add **Apple Distribution** certificate and
upload `paperly_dist.csr`. Download the `.cer`, then create a P12:

```powershell
openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM
openssl pkcs12 -export -inkey paperly_dist.key -in distribution.pem -out paperly_dist.p12
[Convert]::ToBase64String([IO.File]::ReadAllBytes("paperly_dist.p12"))
```

Remember the P12 export password; it becomes `IOS_CERT_PASSWORD`.

## 4. Create a provisioning profile

Apple Developer -> Profiles -> add **App Store** profile:

1. App ID: `com.paperly.scanner`
2. Certificate: the distribution certificate above
3. Download `Paperly_AppStore.mobileprovision`
4. Base64 encode it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("Paperly_AppStore.mobileprovision"))
```

## 5. Add GitHub Actions secrets

Repository -> Settings -> Secrets and variables -> Actions:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `ASC_KEY_ID` | App Store Connect API Key ID |
| `ASC_ISSUER_ID` | App Store Connect Issuer ID |
| `ASC_KEY_P8` | Base64 `.p8` contents |
| `IOS_DIST_CERT_P12` | Base64 `paperly_dist.p12` |
| `IOS_CERT_PASSWORD` | P12 password |
| `IOS_PROVISIONING_PROFILE` | Base64 `.mobileprovision` |

## 6. Run the workflow

GitHub -> Actions -> **iOS Release** -> Run workflow.

- Increase `build_number` for every App Store/TestFlight upload.
- Download the `ios-ipa` artifact after a successful run.

The PR workflow **iOS CI** performs an unsigned simulator build and requires no
Apple secrets.

