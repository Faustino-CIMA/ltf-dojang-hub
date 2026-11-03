function bytesToBase64Url(bytes: Uint8Array) {
  let text = "";
  bytes.forEach((value) => {
    text += String.fromCharCode(value);
  });
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function credentialToJson(credential: PublicKeyCredential) {
  if ("toJSON" in credential && typeof credential.toJSON === "function") {
    return credential.toJSON();
  }
  const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const json: Record<string, unknown> = {
    id: credential.id,
    rawId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: bytesToBase64Url(new Uint8Array(response.clientDataJSON)),
    },
  };
  const payload = json.response as Record<string, unknown>;
  if (response.attestationObject) {
    payload.attestationObject = bytesToBase64Url(new Uint8Array(response.attestationObject));
  }
  if (response.authenticatorData) {
    payload.authenticatorData = bytesToBase64Url(new Uint8Array(response.authenticatorData));
    payload.signature = bytesToBase64Url(new Uint8Array(response.signature));
    if (response.userHandle) {
      payload.userHandle = bytesToBase64Url(new Uint8Array(response.userHandle));
    }
  }
  return json;
}

function prepareCreation(options: PublicKeyCredentialCreationOptionsJSON): CredentialCreationOptions {
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON
    ? PublicKeyCredential.parseCreationOptionsFromJSON(options)
    : ({
        ...options,
        challenge: base64UrlToBytes(options.challenge),
        user: { ...options.user, id: base64UrlToBytes(options.user.id) },
      } as PublicKeyCredentialCreationOptions);
  return { publicKey };
}

function prepareRequest(options: PublicKeyCredentialRequestOptionsJSON): CredentialRequestOptions {
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON
    ? PublicKeyCredential.parseRequestOptionsFromJSON(options)
    : ({
        ...options,
        challenge: base64UrlToBytes(options.challenge),
      } as PublicKeyCredentialRequestOptions);
  return { publicKey };
}

export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON) {
  if (!window.PublicKeyCredential) {
    throw new Error("unsupported");
  }
  const credential = (await navigator.credentials.create(prepareCreation(options))) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("cancelled");
  }
  return credentialToJson(credential);
}

export async function getPasskey(options: PublicKeyCredentialRequestOptionsJSON) {
  if (!window.PublicKeyCredential) {
    throw new Error("unsupported");
  }
  const credential = (await navigator.credentials.get(prepareRequest(options))) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("cancelled");
  }
  return credentialToJson(credential);
}
