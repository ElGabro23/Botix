const { createSign, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS");
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
const projectId = serviceAccount.project_id;

const SUPERADMIN_EMAIL = "gabriel.gutierrezvidal@gmail.com";
const SUPERADMIN_UID = "EYNrH5qaYRQqB0ZdUQrycTnsw1q2";
const OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/identitytoolkit";

const nowSeconds = () => Math.floor(Date.now() / 1000);

const base64Url = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const buildJwt = () => {
  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = nowSeconds();
  const payload = {
    iss: serviceAccount.client_email,
    scope: OAUTH_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3600,
    iat: issuedAt
  };

  const encodedHeader = base64Url(header);
  const encodedPayload = base64Url(payload);
  const signer = createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer
    .sign(serviceAccount.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const getAccessToken = async () => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildJwt()
    })
  });

  if (!response.ok) {
    throw new Error(`No fue posible obtener token OAuth: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
};

const buildHeaders = (accessToken) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json"
});

const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const identityBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;

const listDocuments = async (accessToken, path) => {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(`${firestoreBase}/${path}`);
    url.searchParams.set("pageSize", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: buildHeaders(accessToken)
    });

    if (response.status === 404) return documents;
    if (!response.ok) {
      throw new Error(`No fue posible listar ${path}: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    documents.push(...(payload.documents ?? []));
    pageToken = payload.nextPageToken ?? "";
  } while (pageToken);

  return documents;
};

const deleteDocumentByName = async (accessToken, fullName) => {
  const response = await fetch(`https://firestore.googleapis.com/v1/${fullName}`, {
    method: "DELETE",
    headers: buildHeaders(accessToken)
  });

  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`No fue posible borrar ${fullName}: ${response.status} ${await response.text()}`);
  }
};

const deleteCollectionPath = async (accessToken, path) => {
  const docs = await listDocuments(accessToken, path);
  for (const document of docs) {
    await deleteDocumentByName(accessToken, document.name);
  }
};

const listAuthUsers = async (accessToken) => {
  const users = [];
  let nextPageToken = "";

  do {
    const url = new URL(`${identityBase}/accounts:batchGet`);
    url.searchParams.set("maxResults", "500");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);

    const response = await fetch(url, {
      headers: buildHeaders(accessToken)
    });

    if (!response.ok) {
      throw new Error(`No fue posible listar usuarios Auth: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    users.push(...(payload.users ?? []));
    nextPageToken = payload.nextPageToken ?? "";
  } while (nextPageToken);

  return users;
};

const batchDeleteAuthUsers = async (accessToken, localIds) => {
  if (!localIds.length) return;

  const response = await fetch(`${identityBase}/accounts:batchDelete`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      localIds,
      force: true
    })
  });

  if (!response.ok) {
    throw new Error(`No fue posible borrar usuarios Auth: ${response.status} ${await response.text()}`);
  }
};

const patchSuperadminDoc = async (accessToken) => {
  const documentPath = `users/${SUPERADMIN_UID}`;
  const response = await fetch(`${firestoreBase}/${documentPath}?updateMask.fieldPaths=active&updateMask.fieldPaths=displayName&updateMask.fieldPaths=email&updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt`, {
    method: "PATCH",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      fields: {
        active: { booleanValue: true },
        displayName: { stringValue: "Gabriel Gutierrez" },
        email: { stringValue: SUPERADMIN_EMAIL },
        role: { stringValue: "superadmin" },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`No fue posible asegurar el documento del superadmin: ${response.status} ${await response.text()}`);
  }
};

const createMissingSuperadminDoc = async (accessToken) => {
  const response = await fetch(`${firestoreBase}/users?documentId=${SUPERADMIN_UID}`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      fields: {
        active: { booleanValue: true },
        displayName: { stringValue: "Gabriel Gutierrez" },
        email: { stringValue: SUPERADMIN_EMAIL },
        role: { stringValue: "superadmin" },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    })
  });

  if (response.status === 409) {
    await patchSuperadminDoc(accessToken);
    return;
  }
  if (!response.ok) {
    throw new Error(`No fue posible crear el documento del superadmin: ${response.status} ${await response.text()}`);
  }
};

const ensureSuperadminDoc = async (accessToken) => {
  const response = await fetch(`${firestoreBase}/users/${SUPERADMIN_UID}`, {
    headers: buildHeaders(accessToken)
  });

  if (response.status === 404) {
    await createMissingSuperadminDoc(accessToken);
    return;
  }

  if (!response.ok) {
    throw new Error(`No fue posible leer el documento del superadmin: ${response.status} ${await response.text()}`);
  }

  await patchSuperadminDoc(accessToken);
};

async function main() {
  const accessToken = await getAccessToken();
  const businessDocs = await listDocuments(accessToken, "businesses");

  for (const business of businessDocs) {
    const businessId = business.name.split("/").pop();
    for (const subcollection of ["settings", "customers", "couriers", "deliveryOrders", "liveTracking", "notifications"]) {
      await deleteCollectionPath(accessToken, `businesses/${businessId}/${subcollection}`);
    }
    await deleteDocumentByName(accessToken, business.name);
  }

  await deleteCollectionPath(accessToken, "trackingSessions");

  const userDocs = await listDocuments(accessToken, "users");
  for (const userDoc of userDocs) {
    const userId = userDoc.name.split("/").pop();
    if (userId !== SUPERADMIN_UID) {
      await deleteDocumentByName(accessToken, userDoc.name);
    }
  }

  const authUsers = await listAuthUsers(accessToken);
  const authUsersToDelete = authUsers
    .filter((user) => user.localId !== SUPERADMIN_UID && user.email !== SUPERADMIN_EMAIL)
    .map((user) => user.localId);

  while (authUsersToDelete.length) {
    await batchDeleteAuthUsers(accessToken, authUsersToDelete.splice(0, 100));
  }

  await ensureSuperadminDoc(accessToken);

  console.log("Datos de prueba eliminados. Solo queda el superadmin.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
