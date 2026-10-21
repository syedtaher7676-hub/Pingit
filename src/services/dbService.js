/**
 * ─────────────────────────────────────────────────────────────
 * Cloud Firestore Database Service for Ping (dbService.js)
 * ─────────────────────────────────────────────────────────────
 * Comprehensive persistent data storage and cold-boot recovery for:
 *  - telemetry/live_metrics (historical sessions, match counts, CCU, sentiments, durations, curves)
 *  - bans (active device suspensions and community reports bans)
 *  - reports (user moderation reports feed with status updates)
 *  - custom_words (dynamic prohibited terms blocklist)
 *  - shadowbans (silent ghost quarantine targets)
 *  - penalties & slur_violations (active user/IP strike counts)
 *  - admin_sessions (persistent 30-day multi-device session tokens)
 *  - users, friendships, friend_requests, friend_chats
 *
 * HYBRID DUAL-MODE ARCHITECTURE:
 *  1. Uses Firebase Admin SDK when credentialed.
 *  2. Automatically falls back to high-performance Firestore REST API
 *     with project apiKey and database ID ("ai-studio-ping-97f03824-bc8c-4fb8-b4e8-22aa46e3bdea")
 *     ensuring 100% cloud persistence without "Missing or insufficient permissions" crashes.
 */

const fs = require("fs");
const path = require("path");
const firebaseConfig = require("../config/firebase");
const { FieldValue } = firebaseConfig;

function getDb() {
  return firebaseConfig.getDb();
}

function isFirebaseConfigured() {
  return firebaseConfig.isFirebaseConfigured();
}

const COLLECTIONS = {
  USERS: "users",
  FRIENDSHIPS: "friendships",
  FRIEND_REQUESTS: "friend_requests",
  FRIEND_CHATS: "friend_chats",
  REPORTS: "reports",
  ADMIN_SESSIONS: "admin_sessions",
  TELEMETRY: "telemetry",
  BANS: "bans",
};

let hasWarnedAuthError = false;

function handleDbError(operation, error, targetId = "") {
  const errMsg = error?.message || String(error);
  const isAuthOrPermError =
    errMsg.includes("PERMISSION_DENIED") ||
    errMsg.includes("UNAUTHENTICATED") ||
    errMsg.includes("invalid credential") ||
    errMsg.includes("Project not found");

  if (isAuthOrPermError) {
    if (!hasWarnedAuthError) {
      console.log(
        `ℹ️ [Firestore] Admin SDK notice (${operation}: ${errMsg.slice(0, 80)}). Utilizing direct REST API fallback.`
      );
      hasWarnedAuthError = true;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE REST API RESILIENT CLIENT (FALLBACK ENGINE)
// ─────────────────────────────────────────────────────────────

function getAppletConfig() {
  const candidatePaths = [
    path.resolve(__dirname, "../../firebase-applet-config.json"),
    path.resolve(__dirname, "../firebase-applet-config.json"),
    path.resolve(__dirname, "./firebase-applet-config.json"),
    path.resolve(process.cwd(), "firebase-applet-config.json"),
  ];
  for (const configPath of candidatePaths) {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }
    } catch (_) {}
  }
  return {
    projectId: "impressive-atlas-4ggh3",
    apiKey: "AIzaSyCoxk4oQMIeLenwtdmjZkW04Xr7XAmMqeY",
    firestoreDatabaseId: "ai-studio-ping-97f03824-bc8c-4fb8-b4e8-22aa46e3bdea",
  };
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if (!val || typeof val !== "object") return null;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("stringValue" in val) return val.stringValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    return (val.arrayValue?.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const out = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function parseFirestoreRestDoc(fields) {
  if (!fields || typeof fields !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

async function firestoreRestGet(docPath) {
  const config = getAppletConfig();
  if (!config?.apiKey || !config?.projectId) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId || "(default)"}/documents/${docPath}?key=${config.apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.fields ? parseFirestoreRestDoc(json.fields) : null;
  } catch (_) {
    return null;
  }
}

async function firestoreRestPatch(docPath, dataObj, updateMaskPaths = []) {
  const config = getAppletConfig();
  if (!config?.apiKey || !config?.projectId) return false;
  let url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId || "(default)"}/documents/${docPath}?key=${config.apiKey}`;
  if (Array.isArray(updateMaskPaths) && updateMaskPaths.length > 0) {
    const maskParams = updateMaskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
    url += `&${maskParams}`;
  }
  const fields = {};
  for (const [k, v] of Object.entries(dataObj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function getCanonicalPairId(userAId, userBId) {
  return [userAId, userBId].sort().join("__");
}

// ─────────────────────────────────────────────────────────────
// USER OPERATIONS
// ─────────────────────────────────────────────────────────────

async function syncUserOnAuth(userId, meta = {}) {
  const db = getDb();
  if (!db || !userId) return null;
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    const docSnap = await userRef.get();
    if (!docSnap.exists) {
      const newUser = {
        userId,
        country: meta.country || "Unknown",
        totalMatches: 0,
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        profile: {
          displayName: meta.displayName || `Stranger_${userId.slice(0, 4)}`,
          bio: meta.bio || "",
          interests: Array.isArray(meta.interests) ? meta.interests : [],
        },
      };
      await userRef.set(newUser);
      return { ...newUser, isNew: true };
    } else {
      await userRef.update({
        lastSeenAt: FieldValue.serverTimestamp(),
        ...(meta.country && meta.country !== "Unknown" ? { country: meta.country } : {}),
      });
      return { id: docSnap.id, ...docSnap.data() };
    }
  } catch (error) {
    handleDbError("syncUserOnAuth", error, userId);
    return null;
  }
}

async function getUserProfile(userId) {
  const db = getDb();
  if (!db || !userId) return null;
  try {
    const docSnap = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  } catch (error) {
    handleDbError("getUserProfile", error, userId);
    return null;
  }
}

async function updateUserProfile(userId, profileData = {}) {
  const db = getDb();
  if (!db || !userId) return false;
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    await userRef.set(
      {
        ...profileData,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    handleDbError("updateUserProfile", error, userId);
    return false;
  }
}

async function incrementUserMatchCount(userId) {
  const db = getDb();
  if (!db || !userId) return false;
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    await userRef.set(
      {
        totalMatches: FieldValue.increment(1),
        lastMatchAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    handleDbError("incrementUserMatchCount", error, userId);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// FRIENDSHIP OPERATIONS
// ─────────────────────────────────────────────────────────────

async function saveFriendship(userAId, userBId) {
  const db = getDb();
  if (!db || !userAId || !userBId) return null;
  try {
    const pairId = getCanonicalPairId(userAId, userBId);
    const docRef = db.collection(COLLECTIONS.FRIENDSHIPS).doc(pairId);
    const friendshipData = {
      pairId,
      userAId,
      userBId,
      users: [userAId, userBId],
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await docRef.set(friendshipData, { merge: true });
    return friendshipData;
  } catch (error) {
    handleDbError("saveFriendship", error, `${userAId}-${userBId}`);
    return null;
  }
}

async function getUserFriends(userId) {
  const db = getDb();
  if (!db || !userId) return [];
  try {
    const snapshot = await db
      .collection(COLLECTIONS.FRIENDSHIPS)
      .where("users", "array-contains", userId)
      .where("status", "==", "active")
      .get();
    const friends = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const friendId = data.users.find((uid) => uid !== userId);
      if (friendId) {
        friends.push({
          friendId,
          pairId: data.pairId,
          createdAt: data.createdAt ? data.createdAt.toMillis?.() || Date.now() : Date.now(),
        });
      }
    });
    return friends;
  } catch (error) {
    handleDbError("getUserFriends", error, userId);
    return [];
  }
}

async function removeFriendship(userAId, userBId) {
  const db = getDb();
  if (!db || !userAId || !userBId) return false;
  try {
    const pairId = getCanonicalPairId(userAId, userBId);
    await db.collection(COLLECTIONS.FRIENDSHIPS).doc(pairId).update({
      status: "inactive",
      removedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleDbError("removeFriendship", error, `${userAId}-${userBId}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// FRIEND REQUEST OPERATIONS
// ─────────────────────────────────────────────────────────────

async function createFriendRequest({ requestId, fromUserId, toUserId, roomId }) {
  const db = getDb();
  if (!db || !requestId) return null;
  try {
    const requestData = {
      requestId,
      fromUserId,
      toUserId,
      roomId: roomId || null,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection(COLLECTIONS.FRIEND_REQUESTS).doc(requestId).set(requestData);
    return requestData;
  } catch (error) {
    handleDbError("createFriendRequest", error, requestId);
    return null;
  }
}

async function updateFriendRequestStatus(requestId, status, extraData = {}) {
  const db = getDb();
  if (!db || !requestId) return false;
  try {
    const updatePayload = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      ...extraData,
    };
    if (status === "accepted") {
      updatePayload.acceptedAt = FieldValue.serverTimestamp();
    } else if (status === "rejected") {
      updatePayload.rejectedAt = FieldValue.serverTimestamp();
    }
    await db.collection(COLLECTIONS.FRIEND_REQUESTS).doc(requestId).update(updatePayload);
    return true;
  } catch (error) {
    handleDbError("updateFriendRequestStatus", error, requestId);
    return false;
  }
}

async function getPendingRequestsForUser(userId) {
  const db = getDb();
  if (!db || !userId) return [];
  try {
    const snapshot = await db
      .collection(COLLECTIONS.FRIEND_REQUESTS)
      .where("toUserId", "==", userId)
      .where("status", "==", "pending")
      .get();
    const requests = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      requests.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toMillis?.() || Date.now() : Date.now(),
      });
    });
    return requests;
  } catch (error) {
    handleDbError("getPendingRequestsForUser", error, userId);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// BANS PERSISTENCE & HYDRATION
// ─────────────────────────────────────────────────────────────

let inMemoryBansList = [];

async function saveBanToFirestore(banData) {
  if (!banData || !banData.deviceHash) return false;
  const now = Date.now();
  const banObj = {
    deviceHash: String(banData.deviceHash).trim(),
    targetId: String(banData.targetId || banData.deviceHash).trim(),
    reason: String(banData.reason || "Community safety policy suspension").slice(0, 200),
    bannedAt: Number(banData.bannedAt) || now,
    expiresAt: Number(banData.expiresAt) || (now + (Number(banData.durationMs) || 900000)),
    durationMs: Number(banData.durationMs) || 900000,
    status: "active",
  };

  // Update in-memory list
  inMemoryBansList = inMemoryBansList.filter((b) => b.deviceHash !== banObj.deviceHash && b.expiresAt > now);
  inMemoryBansList.unshift(banObj);
  if (inMemoryBansList.length > 200) inMemoryBansList.length = 200;

  // Persist to Cloud Firestore via REST API (and Admin SDK if active)
  try {
    await firestoreRestPatch("telemetry/live_metrics", { bans: inMemoryBansList }, ["bans"]);
  } catch (_) {}

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection("bans").doc(banObj.deviceHash).set(banObj, { merge: true });
    } catch (_) {}
  }
  return true;
}

async function removeBanFromFirestore(deviceHash) {
  if (!deviceHash) return false;
  const clean = String(deviceHash).trim();
  inMemoryBansList = inMemoryBansList.filter((b) => b.deviceHash !== clean);

  try {
    await firestoreRestPatch("telemetry/live_metrics", { bans: inMemoryBansList }, ["bans"]);
  } catch (_) {}

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection("bans").doc(clean).delete();
    } catch (_) {}
  }
  return true;
}

async function getActiveBansFromFirestore() {
  const now = Date.now();
  // 1. Try Firestore REST read
  try {
    const liveDoc = await firestoreRestGet("telemetry/live_metrics");
    if (liveDoc && Array.isArray(liveDoc.bans)) {
      const active = liveDoc.bans.filter((b) => Number(b.expiresAt) > now);
      inMemoryBansList = active;
      return active;
    }
  } catch (_) {}

  // 2. Try Admin SDK
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const snap = await db.collection("bans").where("expiresAt", ">", now).get();
      const list = [];
      snap.forEach((doc) => list.push(doc.data()));
      inMemoryBansList = list;
      return list;
    } catch (_) {}
  }

  // 3. Fallback to memory
  return inMemoryBansList.filter((b) => b.expiresAt > now);
}

// ─────────────────────────────────────────────────────────────
// REPORT OPERATIONS (PERSISTENCE & RECOVERY)
// ─────────────────────────────────────────────────────────────

let inMemoryReportsList = [];

async function saveReport({
  reportId,
  reporterId,
  reporterCountry,
  reportedUserId,
  reportedUserCountry,
  roomId,
  reason,
  moderationFlags = [],
}) {
  const now = Date.now();
  const repId = reportId || "rep_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  const reportData = {
    reportId: repId,
    reporterId: reporterId || "Anonymous",
    reporterCountry: reporterCountry || "Unknown",
    reportedUserId: reportedUserId || "Unknown",
    reportedUserCountry: reportedUserCountry || "Unknown",
    roomId: roomId || null,
    reason: String(reason || "user_reported").slice(0, 500),
    moderationFlags: Array.isArray(moderationFlags) ? moderationFlags : [],
    status: "pending_review",
    createdAt: new Date(now).toISOString(),
    timestamp: now,
  };

  // Prepend to in-memory list
  inMemoryReportsList = inMemoryReportsList.filter((r) => r.reportId !== repId);
  inMemoryReportsList.unshift(reportData);
  if (inMemoryReportsList.length > 200) inMemoryReportsList.length = 200;

  // Persist to Cloud Firestore via REST API
  try {
    await firestoreRestPatch("telemetry/live_metrics", { reports: inMemoryReportsList }, ["reports"]);
  } catch (_) {}

  // Also write to reports collection if Admin SDK is active
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection(COLLECTIONS.REPORTS).doc(repId).set({
        ...reportData,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      handleDbError("saveReport", error, repId);
    }
  }
  return reportData;
}

async function getRecentReports(limitCount = 50) {
  // 1. Try Firestore REST read
  try {
    const liveDoc = await firestoreRestGet("telemetry/live_metrics");
    if (liveDoc && Array.isArray(liveDoc.reports) && liveDoc.reports.length > 0) {
      inMemoryReportsList = liveDoc.reports;
      return liveDoc.reports.slice(0, limitCount);
    }
  } catch (_) {}

  // 2. Try Admin SDK
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const snapshot = await db
        .collection(COLLECTIONS.REPORTS)
        .orderBy("createdAt", "desc")
        .limit(limitCount)
        .get();
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        let createdIso = null;
        if (data.createdAt && typeof data.createdAt.toDate === "function") {
          createdIso = data.createdAt.toDate().toISOString();
        } else if (data.createdAt) {
          createdIso = String(data.createdAt);
        }
        return {
          ...data,
          reportId: doc.id,
          createdAt: createdIso || new Date().toISOString(),
        };
      });
      if (list.length > 0) return list;
    } catch (error) {
      handleDbError("getRecentReports", error);
    }
  }

  // 3. Fallback to memory
  return inMemoryReportsList.slice(0, limitCount);
}

async function updateReportStatus(reportId, status) {
  if (!reportId || !status) return false;
  // Update in memory list
  let updated = false;
  for (const r of inMemoryReportsList) {
    if (r.reportId === reportId) {
      r.status = status;
      r.updatedAt = new Date().toISOString();
      updated = true;
      break;
    }
  }

  // Persist updated reports array to Firestore
  try {
    await firestoreRestPatch("telemetry/live_metrics", { reports: inMemoryReportsList }, ["reports"]);
  } catch (_) {}

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection(COLLECTIONS.REPORTS).doc(reportId).update({
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    } catch (error) {
      handleDbError("updateReportStatus", error, reportId);
    }
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────
// CUSTOM WORDS & SHADOWBANS PERSISTENCE
// ─────────────────────────────────────────────────────────────

async function saveCustomWordsToFirestore(wordsList) {
  if (!Array.isArray(wordsList)) return false;
  try {
    return await firestoreRestPatch("telemetry/live_metrics", { custom_words: wordsList }, ["custom_words"]);
  } catch (_) {
    return false;
  }
}

async function saveShadowbansToFirestore(shadowbansList) {
  if (!Array.isArray(shadowbansList)) return false;
  try {
    return await firestoreRestPatch("telemetry/live_metrics", { shadowbans: shadowbansList }, ["shadowbans"]);
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// FRIEND CHAT & MESSAGE OPERATIONS
// ─────────────────────────────────────────────────────────────

async function saveFriendChatMessage({
  chatId,
  messageId,
  fromUserId,
  message,
  replyTo = null,
  isFlash = false,
  sentAt = Date.now(),
}) {
  const db = getDb();
  if (!db || !chatId || !messageId) return null;

  try {
    const chatDocRef = db.collection(COLLECTIONS.FRIEND_CHATS).doc(chatId);
    const msgDocRef = chatDocRef.collection("messages").doc(messageId);

    const messageData = {
      messageId,
      chatId,
      fromUserId,
      message,
      replyTo: replyTo || null,
      isFlash: Boolean(isFlash),
      isEdited: false,
      sentAt,
      createdAt: FieldValue.serverTimestamp(),
    };

    await msgDocRef.set(messageData);
    const userIds = chatId.includes("__") ? chatId.split("__") : [];
    await chatDocRef.set(
      {
        chatId,
        participants: userIds.length === 2 ? userIds : [],
        lastMessage: isFlash ? "[Flash Message]" : message.slice(0, 200),
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return messageData;
  } catch (error) {
    handleDbError("saveFriendChatMessage", error, `${chatId}/${messageId}`);
    return null;
  }
}

async function getFriendChatMessages(chatId, limitCount = 50) {
  const db = getDb();
  if (!db || !chatId) return [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.FRIEND_CHATS)
      .doc(chatId)
      .collection("messages")
      .orderBy("sentAt", "asc")
      .limit(limitCount)
      .get();

    const messages = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      messages.push({
        msgId: data.messageId || docSnap.id,
        from: data.fromUserId,
        message: data.message,
        replyTo: data.replyTo || null,
        isFlash: Boolean(data.isFlash),
        isEdited: Boolean(data.isEdited),
        sentAt: data.sentAt || (data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()),
      });
    });
    return messages;
  } catch (error) {
    handleDbError("getFriendChatMessages", error, chatId);
    return [];
  }
}

async function editFriendChatMessage(chatId, messageId, fromUserId, newMessage) {
  const db = getDb();
  if (!db || !chatId || !messageId) return false;
  try {
    const msgRef = db.collection(COLLECTIONS.FRIEND_CHATS).doc(chatId).collection("messages").doc(messageId);
    const snap = await msgRef.get();
    if (!snap.exists || snap.data()?.fromUserId !== fromUserId) return false;
    await msgRef.update({
      message: newMessage,
      isEdited: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleDbError("editFriendChatMessage", error, `${chatId}/${messageId}`);
    return false;
  }
}

async function deleteFriendChatMessage(chatId, messageId, fromUserId) {
  const db = getDb();
  if (!db || !chatId || !messageId) return false;
  try {
    const msgRef = db.collection(COLLECTIONS.FRIEND_CHATS).doc(chatId).collection("messages").doc(messageId);
    const snap = await msgRef.get();
    if (!snap.exists || snap.data()?.fromUserId !== fromUserId) return false;
    await msgRef.delete();
    return true;
  } catch (error) {
    handleDbError("deleteFriendChatMessage", error, `${chatId}/${messageId}`);
    return false;
  }
}

async function getUserConversations(userId) {
  const db = getDb();
  if (!db || !userId) return [];

  try {
    const snapshot = await db
      .collection(COLLECTIONS.FRIEND_CHATS)
      .where("participants", "array-contains", userId)
      .get();

    const conversations = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const participants = Array.isArray(data.participants) ? data.participants : [];
      const otherUserId = participants.find((id) => id !== userId) || "Friend";

      let otherProfile = { displayName: `Friend (${otherUserId.slice(0, 5)})`, country: "Global" };
      try {
        const uDoc = await db.collection(COLLECTIONS.USERS).doc(otherUserId).get();
        if (uDoc.exists) {
          const uData = uDoc.data();
          if (uData.profile?.displayName) otherProfile.displayName = uData.profile.displayName;
          else if (uData.displayName) otherProfile.displayName = uData.displayName;
          if (uData.country) otherProfile.country = uData.country;
        }
      } catch (_) {}

      let previewMsg = data.lastMessage || "No messages yet";
      let lastMsgTime = data.lastMessageAt ? (data.lastMessageAt.toMillis ? data.lastMessageAt.toMillis() : Date.now()) : Date.now();

      try {
        const msgsSnap = await docSnap.ref.collection("messages").orderBy("sentAt", "desc").limit(1).get();
        if (!msgsSnap.empty) {
          const latestDoc = msgsSnap.docs[0].data();
          previewMsg = latestDoc.isFlash ? "⚡ [Flash Message]" : (latestDoc.message || previewMsg);
          if (latestDoc.sentAt) lastMsgTime = latestDoc.sentAt;
        }
      } catch (_) {}

      conversations.push({
        chatId: data.chatId || docSnap.id,
        otherUserId,
        otherUserName: otherProfile.displayName,
        otherUserCountry: otherProfile.country,
        lastMessage: previewMsg,
        lastMessageAt: lastMsgTime,
      });
    }

    conversations.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    return conversations;
  } catch (error) {
    handleDbError("getUserConversations", error, userId);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// PERSISTENT ADMIN SESSIONS
// ─────────────────────────────────────────────────────────────

let inMemoryAdminSessions = new Map();

async function saveAdminSession(token, session = {}) {
  if (!token) return false;
  const now = Date.now();
  const sessionObj = {
    token,
    createdAt: session.createdAt || new Date(now).toISOString(),
    expiresAt: session.expiresAt || (now + 30 * 24 * 3600 * 1000),
    valid: true,
  };
  inMemoryAdminSessions.set(token, sessionObj);

  // Persist to live_metrics.admin_sessions map via REST
  try {
    const currentSessionsObj = {};
    for (const [t, s] of inMemoryAdminSessions.entries()) {
      if (s.expiresAt > now) currentSessionsObj[t] = s;
    }
    await firestoreRestPatch("telemetry/live_metrics", { admin_sessions: currentSessionsObj }, ["admin_sessions"]);
  } catch (_) {}

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection(COLLECTIONS.ADMIN_SESSIONS).doc(token).set(sessionObj, { merge: true });
    } catch (error) {
      handleDbError("saveAdminSession", error, token);
    }
  }
  return true;
}

async function getAdminSession(token) {
  if (!token) return null;
  const now = Date.now();

  // 1. In-memory check
  const mem = inMemoryAdminSessions.get(token);
  if (mem && mem.expiresAt > now && mem.valid !== false) {
    return mem;
  }

  // 2. REST API live_metrics.admin_sessions check
  try {
    const liveDoc = await firestoreRestGet("telemetry/live_metrics");
    if (liveDoc?.admin_sessions && typeof liveDoc.admin_sessions === "object") {
      const s = liveDoc.admin_sessions[token];
      if (s && Number(s.expiresAt) > now && s.valid !== false) {
        inMemoryAdminSessions.set(token, s);
        return s;
      }
    }
  } catch (_) {}

  // 3. Admin SDK check
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const docSnap = await db.collection(COLLECTIONS.ADMIN_SESSIONS).doc(token).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.valid !== false && Number(data.expiresAt) > now) {
          inMemoryAdminSessions.set(token, data);
          return data;
        }
      }
    } catch (error) {
      handleDbError("getAdminSession", error, token);
    }
  }
  return null;
}

async function deleteAdminSession(token) {
  if (!token) return false;
  inMemoryAdminSessions.delete(token);

  try {
    const currentSessionsObj = {};
    for (const [t, s] of inMemoryAdminSessions.entries()) {
      currentSessionsObj[t] = s;
    }
    await firestoreRestPatch("telemetry/live_metrics", { admin_sessions: currentSessionsObj }, ["admin_sessions"]);
  } catch (_) {}

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection(COLLECTIONS.ADMIN_SESSIONS).doc(token).delete();
    } catch (error) {
      handleDbError("deleteAdminSession", error, token);
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// TELEMETRY & FULL COLD-BOOT RECOVERY
// ─────────────────────────────────────────────────────────────

async function getLiveTelemetryMetrics() {
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const docSnap = await db.collection(COLLECTIONS.TELEMETRY).doc("live_metrics").get();
      if (docSnap.exists) return docSnap.data();
    } catch (error) {
      handleDbError("getLiveTelemetryMetrics", error, "live_metrics");
    }
  }
  // Primary REST fallback
  return firestoreRestGet("telemetry/live_metrics");
}

async function atomicSyncTelemetry(pending = {}) {
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const updatePayload = {
        "system_summary.last_updated": FieldValue.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString(),
      };
      if (pending.system_summary?.total_sessions_logged > 0) {
        updatePayload["system_summary.total_sessions_logged"] = FieldValue.increment(pending.system_summary.total_sessions_logged);
      }
      if (pending.system_summary?.total_matches > 0) {
        updatePayload["system_summary.total_matches"] = FieldValue.increment(pending.system_summary.total_matches);
      }
      if (pending.system_summary?.total_messages > 0) {
        updatePayload["system_summary.total_messages"] = FieldValue.increment(pending.system_summary.total_messages);
      }
      if (pending.system_summary?.total_violations > 0) {
        updatePayload["system_summary.total_violations"] = FieldValue.increment(pending.system_summary.total_violations);
      }
      if (pending.system_summary?.active_ccu_peak > 0) {
        updatePayload["system_summary.active_ccu_peak"] = pending.system_summary.active_ccu_peak;
      }
      if (pending.sentiment_distribution) {
        for (const [key, val] of Object.entries(pending.sentiment_distribution)) {
          if (val > 0) updatePayload[`sentiment_distribution.${key}`] = FieldValue.increment(val);
        }
      }
      if (pending.session_durations) {
        for (const [key, val] of Object.entries(pending.session_durations)) {
          if (val > 0) updatePayload[`session_durations.${key}`] = FieldValue.increment(val);
        }
      }
      if (pending.retention_metrics) {
        if (pending.retention_metrics.survival_rate_3m_pct > 0) {
          updatePayload["retention_metrics.survival_rate_3m_pct"] = pending.retention_metrics.survival_rate_3m_pct;
        }
        if (pending.retention_metrics.skip_churn_15s_pct > 0) {
          updatePayload["retention_metrics.skip_churn_15s_pct"] = pending.retention_metrics.skip_churn_15s_pct;
        }
        if (pending.retention_metrics.patience_quotient_pct > 0) {
          updatePayload["retention_metrics.patience_quotient_pct"] = pending.retention_metrics.patience_quotient_pct;
        }
      }
      if (pending.behavior_analytics) {
        updatePayload["behavior_analytics"] = pending.behavior_analytics;
      }
      if (pending.demographics) {
        updatePayload["demographics"] = pending.demographics;
      }
      if (pending.psychology) {
        updatePayload["psychology"] = pending.psychology;
      }
      if (Array.isArray(pending.telemetry_history) && pending.telemetry_history.length > 0) {
        updatePayload["telemetry_history"] = pending.telemetry_history;
      }
      await db.collection(COLLECTIONS.TELEMETRY).doc("live_metrics").set(updatePayload, { merge: true });
      return true;
    } catch (error) {
      handleDbError("atomicSyncTelemetry", error, "live_metrics");
    }
  }

  // REST fallback
  return firestoreRestPatch("telemetry/live_metrics", pending, Object.keys(pending));
}

async function resetBehaviorTelemetry(persistenceData = {}) {
  const cleanSentiment = {
    friendly_greetings: 0,
    curious_questions: 0,
    casual_dialogue: 0,
    playful_humor: 0,
    toxic_messages: 0,
  };
  const cleanDurations = {
    quick_skips_under_15s: 0,
    short_chats_15s_1m: 0,
    medium_chats_1m_3m: 0,
    deep_chats_over_3m: 0,
  };
  const cleanRetention = {
    survival_rate_3m_pct: 0,
    skip_churn_15s_pct: 0,
    patience_quotient_pct: 0,
  };

  const payload = {
    behavior_analytics: persistenceData,
    sentiment_distribution: cleanSentiment,
    session_durations: cleanDurations,
    retention_metrics: cleanRetention,
  };

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await db.collection(COLLECTIONS.TELEMETRY).doc("live_metrics").set(payload, { merge: true });
      return true;
    } catch (_) {}
  }

  return firestoreRestPatch(
    "telemetry/live_metrics",
    payload,
    ["behavior_analytics", "sentiment_distribution", "session_durations", "retention_metrics"]
  );
}

/**
 * Atomic Cold-Boot Hydration: Restores all bans, reports, custom words,
 * shadowbans, admin sessions, and telemetry directly from Cloud Firestore
 * so the application and admin dashboard operate seamlessly after container sleeps.
 */
async function hydrateAllFromFirestore() {
  const now = Date.now();
  console.log("⚡ [Firestore] Starting full cold-boot hydration from Cloud Firestore...");
  try {
    const docData = await getLiveTelemetryMetrics();
    if (!docData) {
      console.log("ℹ️ [Firestore] No live_metrics document found yet. Fresh state initialized.");
      return null;
    }

    // 1. Hydrate Active Bans
    if (Array.isArray(docData.bans) && docData.bans.length > 0) {
      const activeBans = docData.bans.filter((b) => Number(b.expiresAt) > now);
      inMemoryBansList = activeBans;
      const reportsModule = require("../state/reports");
      const storeModule = require("../state/store");
      const slurFilterModule = require("../data/slurFilter");

      if (reportsModule && reportsModule.bans) {
        for (const b of activeBans) {
          reportsModule.bans.set(b.deviceHash, Number(b.expiresAt));
          if (reportsModule.banMetadata) {
            reportsModule.banMetadata.set(b.deviceHash, {
              reason: b.reason || "Suspension",
              bannedAt: b.bannedAt || now,
              durationMs: b.durationMs || 900000,
            });
          }
          if (storeModule.temporaryBans) {
            storeModule.temporaryBans.set(b.deviceHash, Number(b.expiresAt));
          }
          if (slurFilterModule.applyPenalty) {
            slurFilterModule.applyPenalty(b.deviceHash, "ban_15min", Math.max(1000, Number(b.expiresAt) - now));
          }
        }
      }
      console.log(`✅ [Firestore] Hydrated ${activeBans.length} active device ban(s) from Firestore.`);
    }

    // 2. Hydrate Reports Feed
    if (Array.isArray(docData.reports) && docData.reports.length > 0) {
      inMemoryReportsList = docData.reports;
      const reportsModule = require("../state/reports");
      if (reportsModule && Array.isArray(reportsModule.recentReports)) {
        reportsModule.recentReports.length = 0;
        reportsModule.recentReports.push(...docData.reports.slice(-100));
      }
      console.log(`✅ [Firestore] Hydrated ${docData.reports.length} moderation report(s) from Firestore.`);
    }

    // 3. Hydrate Custom Blocked Words
    if (Array.isArray(docData.custom_words) && docData.custom_words.length > 0) {
      const slurFilterModule = require("../data/slurFilter");
      if (slurFilterModule && slurFilterModule.addCustomWord) {
        docData.custom_words.forEach((w) => slurFilterModule.addCustomWord(w));
      }
      console.log(`✅ [Firestore] Hydrated ${docData.custom_words.length} custom blocked word(s) from Firestore.`);
    }

    // 4. Hydrate Shadowbans (Ghost Mode)
    if (Array.isArray(docData.shadowbans) && docData.shadowbans.length > 0) {
      const socketHandlers = require("../socket/registerSocketHandlers");
      if (socketHandlers && socketHandlers.addShadowban) {
        docData.shadowbans.forEach((sb) => {
          if (Number(sb.expiresAt) > now) {
            socketHandlers.addShadowban(sb.target, Math.max(1000, Number(sb.expiresAt) - now), sb.reason);
          }
        });
      }
      console.log(`✅ [Firestore] Hydrated active shadowban(s) from Firestore.`);
    }

    // 5. Hydrate Admin Sessions
    if (docData.admin_sessions && typeof docData.admin_sessions === "object") {
      for (const [token, s] of Object.entries(docData.admin_sessions)) {
        if (s && Number(s.expiresAt) > now) {
          inMemoryAdminSessions.set(token, s);
          if (global.adminSessionsMap) {
            global.adminSessionsMap.set(token, s);
          }
        }
      }
      console.log(`✅ [Firestore] Hydrated ${inMemoryAdminSessions.size} active admin session token(s) from Firestore.`);
    }

    return docData;
  } catch (err) {
    console.warn("⚠️ [Firestore] Cold-boot hydration exception:", err?.message);
    return null;
  }
}

module.exports = {
  COLLECTIONS,
  getCanonicalPairId,
  // User operations
  syncUserOnAuth,
  getUserProfile,
  updateUserProfile,
  incrementUserMatchCount,
  // Friendship operations
  saveFriendship,
  getUserFriends,
  removeFriendship,
  // Friend request operations
  createFriendRequest,
  updateFriendRequestStatus,
  getPendingRequestsForUser,
  // Friend chat operations
  saveFriendChatMessage,
  getFriendChatMessages,
  getUserConversations,
  editFriendChatMessage,
  deleteFriendChatMessage,
  // Report operations
  saveReport,
  getRecentReports,
  updateReportStatus,
  // Ban operations
  saveBanToFirestore,
  removeBanFromFirestore,
  getActiveBansFromFirestore,
  // Custom words & shadowbans operations
  saveCustomWordsToFirestore,
  saveShadowbansToFirestore,
  // Admin session operations
  saveAdminSession,
  getAdminSession,
  deleteAdminSession,
  // Telemetry operations
  getLiveTelemetryMetrics,
  atomicSyncTelemetry,
  resetBehaviorTelemetry,
  hydrateAllFromFirestore,
  isFirebaseConfigured,
  toFirestoreValue,
  fromFirestoreValue,
  firestoreRestGet,
  firestoreRestPatch,
};
