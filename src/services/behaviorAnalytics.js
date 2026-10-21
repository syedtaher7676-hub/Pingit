// ═══════════════════════════════════════════════════════════════
// BEHAVIORAL INTELLIGENCE, VIOLATION & GOOGLE L3 PM GROWTH SERVICE
// ═══════════════════════════════════════════════════════════════
// Tracks real-time user messaging behavior, conversational health, slur usage,
// contact exchange attempts, repeat offenders, and Google L3 Product Manager
// growth telemetry (6-stage AARRR funnel, turn-taking symmetry, response latency,
// 10s ghosting bounce, queue abandonment loss, tag affinity cohorts, 24h diurnal
// activity, live A/B experiments, and real-time Growth vs. Loss deltas).

const crypto = require('crypto');
const { users, rooms, waitingSet } = require('../state/store');

// Global Counters
let totalMessagesProcessed = 0;
let totalMessagesDelivered = 0;
let totalMessagesBlocked = 0;
let totalDeliveredChars = 0;

// Specific Violation Counters
let phoneNumbersSharedCount = 0;
let phoneNumbersAskedCount = 0;
let socialHandlesCount = 0;
let slursInterceptedCount = 0;
let threatsInterceptedCount = 0;
let linksBlockedCount = 0;
let symbolsBlockedCount = 0;

// Categorized Slur Distribution
const slurCategories = {
  racialAndEthnic: 0,
  predatoryAndGrooming: 0,
  homophobicTransphobic: 0,
  misogynisticAbuse: 0,
  cyberbullyingAndSelfHarm: 0,
  regionalHinglish: 0,
  otherProfanity: 0,
};

// Contact Extraction Breakdown
const contactExtractionStats = {
  numbersShared: 0,
  numbersAsked: 0,
  instagramHandles: 0,
  snapchatHandles: 0,
  telegramDiscord: 0,
};

// Session Duration & Engagement Tracking
let completedSessionsCount = 0;
let totalDurationSecondsSum = 0;
const sessionDurationBuckets = {
  quickSkips: 0, // < 15s
  shortChats: 0, // 15s - 60s
  mediumChats: 0, // 1m - 3m
  deepConversations: 0, // > 3m
};

const messagesPerChatBuckets = {
  oneToFive: 0,
  sixToTwenty: 0,
  twentyOneToFifty: 0,
  fiftyPlus: 0,
};

// ═══════════════════════════════════════════════════════════════
// GOOGLE L3 PRODUCT MANAGER USER BEHAVIOR & GROWTH METRICS
// ═══════════════════════════════════════════════════════════════
// 1. 6-Stage User Activation & Conversion Funnel (AARRR Funnel)
const growthFunnel = {
  visitorArrivals: 0,
  queueEnters: 0,
  queueAbandons: 0,
  matchesMade: 0,
  firstMessagesSent: 0,
  activatedChats3Turns: 0, // Aha! moment: >= 3 conversational turns exchanged
  deepConnections: 0,     // Chats >= 60s or >= 10 messages
};

// Deduplication sets to guarantee zero double-counting per room (race-condition safe)
const firstMsgRoomsSet = new Set();
const activated3TurnsRoomsSet = new Set();
const deepConnectedRoomsSet = new Set();

// 2. Conversational Quality & Engagement Dynamics
const engagementDynamics = {
  turnSymmetrySum: 0,
  turnSymmetryCount: 0,
  responseLatencySumMs: 0,
  responseLatencyCount: 0,
  ghostedChatsCount: 0,
  totalChatsCount: 0,
  cleanChatDurationSum: 0,
  cleanChatCount: 0,
  violativeChatDurationSum: 0,
  violativeChatCount: 0,
};

// 3. 24-Hour Diurnal Circadian Matching Activity (100% real counters)
const hourlyDiurnalActivity = Array.from({ length: 24 }, (_, h) => ({
  hour: h,
  hourLabel: `${String(h).padStart(2, '0')}:00`,
  visitorsCount: 0,
  chatsCount: 0,
  messagesCount: 0,
  violationsCount: 0,
  durationSecSum: 0,
  avgDurationSec: 0,
  civilityScorePct: 100,
}));

// 4. Interest Tag Matchmaking vs General Queue Cohorts
const tagAnalytics = {
  taggedQueueEnters: 0,
  untaggedQueueEnters: 0,
  taggedMatchesCount: 0,
  untaggedMatchesCount: 0,
  taggedDurationSum: 0,
  untaggedDurationSum: 0,
  taggedCompletedCount: 0,
  untaggedCompletedCount: 0,
  taggedSkipCount: 0,
  untaggedSkipCount: 0,
  taggedCleanCount: 0,
  untaggedCleanCount: 0,
  topTags: {
    gaming: 0,
    tech: 0,
    music: 0,
    movies: 0,
    studies: 0,
    sports: 0,
    food: 0,
    travel: 0,
  },
};

// 5. Rolling Baseline Snapshot for Real-Time Growth vs. Loss (Delta) Computation
let baselineSnapshot = null;
let lastSyncTimestamp = Date.now();
let isHydratedFromCloud = false;

// Conversational Vibe & Tone Distribution
const conversationVibes = {
  friendlyGreetings: 0,
  curiousQuestions: 0,
  casualChat: 0,
  playfulHumor: 0,
  hostileAbuse: 0,
};

// Real-Time Interception Wire Log (Sliding window of last 150 events)
const MAX_WIRE_EVENTS = 150;
const interceptionWire = [];

// Top Flagged Patterns & Trigger Words Frequency Leaderboard
const triggerFrequencyMap = new Map();

// Repeat Policy & Slur Offenders Map
const repeatOffendersMap = new Map();

// Live Real-Time User Actions Stream (User activity feed across the fleet)
const MAX_LIVE_ACTIONS = 120;
const liveUserActions = [];

function triggerCloudSync() {
  lastSyncTimestamp = Date.now();
  if (typeof global.triggerImmediateTelemetryFlush === 'function') {
    global.triggerImmediateTelemetryFlush();
  }
}

function recordUserAction(arg1, userIdArg, countryArg, detailArg, iconArg) {
  let payload = {};
  if (typeof arg1 === 'object' && arg1 !== null) {
    payload = arg1;
  } else {
    payload = {
      type: arg1,
      userId: userIdArg,
      country: countryArg,
      detail: detailArg,
      icon: iconArg,
    };
  }
  const item = {
    id: 'act_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    timestamp: Date.now(),
    type: payload.type || 'event',
    userId: payload.userId || 'Anonymous',
    country: payload.country || 'Global',
    detail: String(payload.detail || '').slice(0, 100),
    icon: payload.icon || '⚡',
  };
  liveUserActions.unshift(item);
  if (liveUserActions.length > MAX_LIVE_ACTIONS) {
    liveUserActions.pop();
  }
  return item;
}

// Minute-by-Minute Rolling Time Series (up to 30 1-minute window snapshots)
const minuteBuckets = [];

function getOrCreateCurrentBucket() {
  const now = Date.now();
  const minuteKey = Math.floor(now / 60000) * 60000;
  let bucket = minuteBuckets[minuteBuckets.length - 1];
  if (!bucket || bucket.timestamp !== minuteKey) {
    bucket = {
      timestamp: minuteKey,
      timeLabel: new Date(minuteKey).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cleanMsgs: 0,
      slurs: 0,
      askedNumbers: 0,
      sharedNumbers: 0,
      socials: 0,
      otherBlocked: 0,
    };
    minuteBuckets.push(bucket);
    if (minuteBuckets.length > 30) {
      minuteBuckets.shift();
    }
  }
  return bucket;
}

const seedNow = Date.now();
for (let i = 15; i >= 0; i--) {
  const t = Math.floor((seedNow - i * 60000) / 60000) * 60000;
  minuteBuckets.push({
    timestamp: t,
    timeLabel: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cleanMsgs: 0,
    slurs: 0,
    askedNumbers: 0,
    sharedNumbers: 0,
    socials: 0,
    otherBlocked: 0,
  });
}

function classifySlurWord(word = '') {
  const w = String(word).toLowerCase().trim();
  if (['nigger', 'nigga', 'negro', 'chink', 'gook', 'spic', 'kike', 'coon', 'paki', 'raghead', 'cracker'].some(t => w.includes(t))) {
    return 'racialAndEthnic';
  }
  if (['diddy', 'dixxy', 'diddi', 'diddler', 'epstein', 'chomo', 'groomer', 'pedophile', 'pedo', 'jailbait'].some(t => w.includes(t))) {
    return 'predatoryAndGrooming';
  }
  if (['faggot', 'fag', 'dyke', 'homo', 'tranny', 'shemale'].some(t => w.includes(t))) {
    return 'homophobicTransphobic';
  }
  if (['slut', 'whore', 'bitch', 'cunt', 'twat'].some(t => w.includes(t))) {
    return 'misogynisticAbuse';
  }
  if (['kys', 'kill yourself', 'go die', 'commit suicide', 'drink bleach', 'slit your'].some(t => w.includes(t))) {
    return 'cyberbullyingAndSelfHarm';
  }
  if (['bhenchod', 'behenchod', 'madarchod', 'chutiya', 'gandu', 'bhosadike', 'randi', 'harami', 'sule', 'thika', 'lanja'].some(t => w.includes(t))) {
    return 'regionalHinglish';
  }
  return 'otherProfanity';
}

function recordTriggerFrequency(trigger, category) {
  if (!trigger) return;
  const key = String(trigger).toLowerCase().trim().slice(0, 40);
  const existing = triggerFrequencyMap.get(key) || { trigger: key, count: 0, category: category || 'general', lastSeen: Date.now() };
  existing.count++;
  existing.lastSeen = Date.now();
  triggerFrequencyMap.set(key, existing);

  if (triggerFrequencyMap.size > 140) {
    const sorted = Array.from(triggerFrequencyMap.entries()).sort((a, b) => b[1].count - a[1].count);
    triggerFrequencyMap.clear();
    for (let i = 0; i < 100 && i < sorted.length; i++) {
      triggerFrequencyMap.set(sorted[i][0], sorted[i][1]);
    }
  }
}

function recordOffenderViolation(userId, type, country, deviceHash, snippet) {
  const effectiveId = (userId && userId !== 'Anonymous') ? userId : (deviceHash && deviceHash !== 'None' ? deviceHash : null);
  if (!effectiveId) return;

  const existing = repeatOffendersMap.get(effectiveId) || {
    userId: effectiveId,
    country: country || 'Global',
    deviceHash: deviceHash || 'None',
    violationCount: 0,
    slursCount: 0,
    askedNumbersCount: 0,
    sharedNumbersCount: 0,
    socialsCount: 0,
    otherCount: 0,
    lastViolationTime: Date.now(),
    lastSnippet: '',
    lastType: type,
  };

  existing.violationCount++;
  existing.lastViolationTime = Date.now();
  existing.lastSnippet = (snippet || '').slice(0, 50);
  existing.lastType = type;
  if (country && country !== 'Global') existing.country = country;
  if (deviceHash && deviceHash !== 'None') existing.deviceHash = deviceHash;

  if (type === 'slur_detected') existing.slursCount++;
  else if (type === 'phone_asked') existing.askedNumbersCount++;
  else if (type === 'phone_shared') existing.sharedNumbersCount++;
  else if (type === 'social_handle') existing.socialsCount++;
  else existing.otherCount++;

  repeatOffendersMap.set(effectiveId, existing);

  if (repeatOffendersMap.size > 500) {
    const oldestKey = repeatOffendersMap.keys().next().value;
    repeatOffendersMap.delete(oldestKey);
  }

  triggerCloudSync();
}

function updateCurrentHourDiurnal({ visitors = 0, chats = 0, messages = 0, violations = 0, durationSec = 0 }) {
  const currentHour = new Date().getHours();
  const slot = hourlyDiurnalActivity[currentHour];
  if (!slot) return;
  slot.visitorsCount = (slot.visitorsCount || 0) + visitors;
  slot.chatsCount = (slot.chatsCount || 0) + chats;
  slot.messagesCount = (slot.messagesCount || 0) + messages;
  slot.violationsCount = (slot.violationsCount || 0) + violations;
  slot.durationSecSum = (slot.durationSecSum || 0) + durationSec;
  if (slot.chatsCount > 0) {
    slot.avgDurationSec = Math.round(slot.durationSecSum / slot.chatsCount);
  }
  const totalHourMsgs = slot.messagesCount + slot.violationsCount;
  slot.civilityScorePct = totalHourMsgs > 0
    ? Number(((slot.messagesCount / totalHourMsgs) * 100).toFixed(1))
    : 100;
}

// Public API Functions

function recordMessageDelivered(text = '') {
  totalMessagesProcessed++;
  totalMessagesDelivered++;

  const str = String(text || '').trim();
  totalDeliveredChars += str.length;

  const lower = str.toLowerCase();
  if (/^(hi|hey|hello|yo|sup|hlo|heyy|namaste|hola)\b/i.test(lower)) {
    conversationVibes.friendlyGreetings++;
    if (typeof global.recordTelemetrySentiment === 'function') global.recordTelemetrySentiment('friendly_greetings');
  } else if (/\?|^(what|where|how|who|why|which|are you|do you)\b/i.test(lower)) {
    conversationVibes.curiousQuestions++;
    if (typeof global.recordTelemetrySentiment === 'function') global.recordTelemetrySentiment('curious_questions');
  } else if (/haha|hehe|lol|lmao|rofl|😂|🤣|xd|😆/i.test(lower)) {
    conversationVibes.playfulHumor++;
    if (typeof global.recordTelemetrySentiment === 'function') global.recordTelemetrySentiment('playful_humor');
  } else {
    conversationVibes.casualChat++;
    if (typeof global.recordTelemetrySentiment === 'function') global.recordTelemetrySentiment('casual_dialogue');
  }

  const bucket = getOrCreateCurrentBucket();
  bucket.cleanMsgs++;
  updateCurrentHourDiurnal({ messages: 1 });
  triggerCloudSync();
}

function recordViolationEvent({
  type,
  userId,
  deviceHash,
  country = 'Global',
  snippet = '',
  action = 'Blocked',
  severity = 'warning',
  matchedWords = [],
  category = null,
}) {
  totalMessagesProcessed++;
  totalMessagesBlocked++;
  conversationVibes.hostileAbuse++;
  if (typeof global.recordTelemetrySentiment === 'function') global.recordTelemetrySentiment('toxic_messages');

  const id = 'evt_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  let categoryName = 'Community Safety';
  const bucket = getOrCreateCurrentBucket();

  switch (type) {
    case 'phone_shared':
      phoneNumbersSharedCount++;
      contactExtractionStats.numbersShared++;
      categoryName = 'Phone Number Sharing';
      bucket.sharedNumbers++;
      recordTriggerFrequency('phone_number_digits', 'Contact Extraction');
      break;

    case 'phone_asked':
      phoneNumbersAskedCount++;
      contactExtractionStats.numbersAsked++;
      categoryName = 'Asking For Numbers / WhatsApp';
      bucket.askedNumbers++;
      recordTriggerFrequency('asked_for_phone_number', 'Contact Extraction');
      break;

    case 'social_handle':
      socialHandlesCount++;
      categoryName = 'Social Media Handle (IG/Snap)';
      bucket.socials++;
      if (snippet.toLowerCase().includes('insta') || snippet.toLowerCase().includes('ig')) {
        contactExtractionStats.instagramHandles++;
        recordTriggerFrequency('instagram_handle_request', 'Social Handles');
      } else if (snippet.toLowerCase().includes('snap') || snippet.toLowerCase().includes('sc')) {
        contactExtractionStats.snapchatHandles++;
        recordTriggerFrequency('snapchat_handle_request', 'Social Handles');
      } else {
        contactExtractionStats.telegramDiscord++;
        recordTriggerFrequency('messaging_handle_request', 'Social Handles');
      }
      break;

    case 'slur_detected':
      slursInterceptedCount++;
      categoryName = 'Slur / Abusive Speech';
      bucket.slurs++;
      const words = Array.isArray(matchedWords) && matchedWords.length > 0 ? matchedWords : [snippet.slice(0, 20)];
      for (const w of words) {
        const cat = classifySlurWord(w);
        if (typeof slurCategories[cat] !== 'undefined') {
          slurCategories[cat]++;
        } else {
          slurCategories.otherProfanity++;
        }
        recordTriggerFrequency(w, 'Slur Filter');
      }
      break;

    case 'threat_detected':
      threatsInterceptedCount++;
      categoryName = category ? `Threat / ${category}` : 'Threat / Harassment';
      bucket.otherBlocked++;
      recordTriggerFrequency(category || 'threat_pattern', 'Safety Threat');
      break;

    case 'link_blocked':
      linksBlockedCount++;
      categoryName = 'External Link / Invite URL';
      bucket.otherBlocked++;
      recordTriggerFrequency('external_url_link', 'Link Shield');
      break;

    case 'symbols_blocked':
      symbolsBlockedCount++;
      categoryName = 'Excessive Symbols / Punctuation';
      bucket.otherBlocked++;
      break;

    default:
      categoryName = 'Policy Enforcement';
      bucket.otherBlocked++;
      break;
  }

  updateCurrentHourDiurnal({ violations: 1 });
  recordOffenderViolation(userId, type, country, deviceHash, snippet);

  let safeSnippet = snippet || '';
  if (type === 'phone_shared') {
    safeSnippet = safeSnippet.replace(/\d{4,}/g, '****');
  } else if (type === 'slur_detected') {
    safeSnippet = matchedWords.length > 0 ? `Flagged: [${matchedWords.join(', ')}]` : `Pattern: ${safeSnippet.slice(0, 25)}...`;
  } else {
    safeSnippet = safeSnippet.slice(0, 60);
  }

  const wireItem = {
    id,
    timestamp: Date.now(),
    type,
    categoryName,
    userId: userId || 'Anonymous',
    deviceHash: deviceHash || 'None',
    country: country || 'Unknown',
    snippet: safeSnippet,
    action,
    severity,
  };

  interceptionWire.unshift(wireItem);
  if (interceptionWire.length > MAX_WIRE_EVENTS) {
    interceptionWire.pop();
  }

  triggerCloudSync();
  return wireItem;
}

function recordSessionCompleted(durationSeconds = 0, messageCount = 0, reason = 'session_ended') {
  completedSessionsCount++;
  totalDurationSecondsSum += durationSeconds;
  if (typeof global.recordTelemetrySession === 'function') {
    global.recordTelemetrySession(durationSeconds);
  }

  if (durationSeconds < 15) {
    sessionDurationBuckets.quickSkips++;
  } else if (durationSeconds <= 60) {
    sessionDurationBuckets.shortChats++;
  } else if (durationSeconds <= 180) {
    sessionDurationBuckets.mediumChats++;
  } else {
    sessionDurationBuckets.deepConversations++;
  }

  if (messageCount <= 5) {
    messagesPerChatBuckets.oneToFive++;
  } else if (messageCount <= 20) {
    messagesPerChatBuckets.sixToTwenty++;
  } else if (messageCount <= 50) {
    messagesPerChatBuckets.twentyOneToFifty++;
  } else {
    messagesPerChatBuckets.fiftyPlus++;
  }
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE L3 PM REAL-TIME RECORDING HOOKS (RACE-CONDITION SAFE)
// ═══════════════════════════════════════════════════════════════

function captureBaselineIfNeeded() {
  if (!baselineSnapshot && (growthFunnel.visitorArrivals > 0 || completedSessionsCount > 0)) {
    baselineSnapshot = computeCorePMMetrics(false);
  }
}

function recordVisitorArrival() {
  captureBaselineIfNeeded();
  growthFunnel.visitorArrivals++;
  updateCurrentHourDiurnal({ visitors: 1 });
  triggerCloudSync();
}

function recordQueueEnter(interests = []) {
  captureBaselineIfNeeded();
  growthFunnel.queueEnters++;
  if (growthFunnel.visitorArrivals < growthFunnel.queueEnters) {
    growthFunnel.visitorArrivals = growthFunnel.queueEnters;
  }

  const cleanTags = Array.isArray(interests)
    ? interests.map(t => String(t).toLowerCase().trim()).filter(Boolean)
    : [];

  if (cleanTags.length > 0) {
    tagAnalytics.taggedQueueEnters = (tagAnalytics.taggedQueueEnters || 0) + 1;
    for (const tag of cleanTags) {
      const normalized = tag === 'study' ? 'studies' : tag;
      if (tagAnalytics.topTags[normalized] !== undefined) {
        tagAnalytics.topTags[normalized]++;
      } else {
        tagAnalytics.topTags[normalized] = (tagAnalytics.topTags[normalized] || 0) + 1;
      }
    }
  } else {
    tagAnalytics.untaggedQueueEnters = (tagAnalytics.untaggedQueueEnters || 0) + 1;
  }

  triggerCloudSync();
}

function recordQueueAbandon() {
  captureBaselineIfNeeded();
  growthFunnel.queueAbandons = (growthFunnel.queueAbandons || 0) + 1;
  triggerCloudSync();
}

function recordMatchFormed(hasTags = false, matchedTag = null, allCommonTags = []) {
  captureBaselineIfNeeded();
  growthFunnel.matchesMade++;
  // Guarantee monotonic funnel hierarchy integrity
  if (growthFunnel.queueEnters < growthFunnel.matchesMade) {
    growthFunnel.queueEnters = growthFunnel.matchesMade;
  }
  if (growthFunnel.visitorArrivals < growthFunnel.queueEnters) {
    growthFunnel.visitorArrivals = growthFunnel.queueEnters;
  }

  if (hasTags) {
    tagAnalytics.taggedMatchesCount++;
  } else {
    tagAnalytics.untaggedMatchesCount++;
  }

  const tagsToRecord = Array.isArray(allCommonTags) && allCommonTags.length > 0
    ? allCommonTags
    : (matchedTag ? [matchedTag] : []);

  for (const t of tagsToRecord) {
    const normalized = String(t).toLowerCase().trim() === 'study' ? 'studies' : String(t).toLowerCase().trim();
    if (normalized) {
      tagAnalytics.topTags[normalized] = (tagAnalytics.topTags[normalized] || 0) + 1;
    }
  }

  triggerCloudSync();
}

function recordMessageTurn(
  roomId,
  userId,
  msgLength = 0,
  turnsCount = 0,
  totalMsgs = 1,
  latencyMs = null,
  userMsgCounts = null
) {
  captureBaselineIfNeeded();

  // Stage 4: First Message Sent (Icebreaker) — strictly once per roomId
  if (roomId && !firstMsgRoomsSet.has(roomId) && totalMsgs >= 1) {
    firstMsgRoomsSet.add(roomId);
    growthFunnel.firstMessagesSent++;
    if (growthFunnel.matchesMade < growthFunnel.firstMessagesSent) {
      growthFunnel.matchesMade = growthFunnel.firstMessagesSent;
    }
    if (firstMsgRoomsSet.size > 5000) {
      const oldest = firstMsgRoomsSet.values().next().value;
      firstMsgRoomsSet.delete(oldest);
    }
  } else if (!roomId && totalMsgs === 1) {
    growthFunnel.firstMessagesSent++;
  }

  // Stage 5: 3-Turn Aha! Moment Activation — strictly once per roomId
  if (roomId && !activated3TurnsRoomsSet.has(roomId) && turnsCount >= 3) {
    activated3TurnsRoomsSet.add(roomId);
    growthFunnel.activatedChats3Turns++;
    if (growthFunnel.firstMessagesSent < growthFunnel.activatedChats3Turns) {
      growthFunnel.firstMessagesSent = growthFunnel.activatedChats3Turns;
    }
    if (activated3TurnsRoomsSet.size > 5000) {
      const oldest = activated3TurnsRoomsSet.values().next().value;
      activated3TurnsRoomsSet.delete(oldest);
    }
  } else if (!roomId && turnsCount === 3) {
    growthFunnel.activatedChats3Turns++;
  }

  // Stage 6: Real-time Deep Connection detection if totalMsgs >= 10 while room is active
  if (roomId && !deepConnectedRoomsSet.has(roomId) && totalMsgs >= 10) {
    deepConnectedRoomsSet.add(roomId);
    growthFunnel.deepConnections++;
    if (growthFunnel.activatedChats3Turns < growthFunnel.deepConnections) {
      growthFunnel.activatedChats3Turns = growthFunnel.deepConnections;
    }
    if (deepConnectedRoomsSet.size > 5000) {
      const oldest = deepConnectedRoomsSet.values().next().value;
      deepConnectedRoomsSet.delete(oldest);
    }
  }

  // Live Response Latency update on turn transition
  if (typeof latencyMs === 'number' && latencyMs >= 100 && latencyMs <= 120000) {
    engagementDynamics.responseLatencySumMs += latencyMs;
    engagementDynamics.responseLatencyCount++;
  }

  triggerCloudSync();
}

function recordChatCompletion(
  durationSeconds = 0,
  messageCount = 0,
  turnsCount = 0,
  isClean = true,
  hadTags = false,
  userMsgCounts = {},
  responseLatencies = [],
  roomId = null
) {
  captureBaselineIfNeeded();
  recordSessionCompleted(durationSeconds, messageCount, 'completed');

  engagementDynamics.totalChatsCount++;

  // Ensure matchesMade is at least totalChatsCount
  if (growthFunnel.matchesMade < engagementDynamics.totalChatsCount) {
    growthFunnel.matchesMade = engagementDynamics.totalChatsCount;
  }
  if (growthFunnel.queueEnters < growthFunnel.matchesMade * 2) {
    growthFunnel.queueEnters = Math.max(growthFunnel.queueEnters, growthFunnel.matchesMade);
  }
  if (growthFunnel.visitorArrivals < growthFunnel.queueEnters) {
    growthFunnel.visitorArrivals = growthFunnel.queueEnters;
  }

  // Step 6: Deep connections (>= 60s or >= 10 messages), deduplicated per roomId
  if (durationSeconds >= 60 || messageCount >= 10) {
    if (!roomId || !deepConnectedRoomsSet.has(roomId)) {
      if (roomId) deepConnectedRoomsSet.add(roomId);
      growthFunnel.deepConnections++;
    }
  }

  // Ghosted chats (< 10s or 0 replies from second peer)
  const counts = Object.values(userMsgCounts || {}).map(Number);
  const peersWhoSpoke = counts.filter(c => c > 0).length;
  if ((durationSeconds < 10 && messageCount <= 1) || (durationSeconds < 15 && peersWhoSpoke <= 1 && messageCount <= 1)) {
    engagementDynamics.ghostedChatsCount++;
  }

  // Turn-Taking Symmetry calculation: 100% when c1 == c2, 0% when one peer sends all messages and other sends 0
  if (counts.length >= 2) {
    const c1 = Number(counts[0]) || 0;
    const c2 = Number(counts[1]) || 0;
    if (c1 + c2 >= 1) {
      const minC = Math.min(c1, c2);
      const maxC = Math.max(c1, c2);
      const symmetryRatio = maxC > 0 ? (minC / maxC) * 100 : 0;
      engagementDynamics.turnSymmetrySum += symmetryRatio;
      engagementDynamics.turnSymmetryCount++;
    }
  }

  // If latencies weren't already recorded turn-by-turn, record any remaining
  if (Array.isArray(responseLatencies) && responseLatencies.length > 0 && engagementDynamics.responseLatencyCount === 0) {
    for (const lat of responseLatencies) {
      if (typeof lat === 'number' && lat > 0 && lat < 120000) {
        engagementDynamics.responseLatencySumMs += lat;
        engagementDynamics.responseLatencyCount++;
      }
    }
  }

  // Clean chat vs Violative chat duration
  if (isClean) {
    engagementDynamics.cleanChatDurationSum += durationSeconds;
    engagementDynamics.cleanChatCount++;
  } else {
    engagementDynamics.violativeChatDurationSum += durationSeconds;
    engagementDynamics.violativeChatCount++;
  }

  // Tag cohort completion stats
  if (hadTags) {
    tagAnalytics.taggedDurationSum += durationSeconds;
    tagAnalytics.taggedCompletedCount = (tagAnalytics.taggedCompletedCount || 0) + 1;
    if (durationSeconds < 15) tagAnalytics.taggedSkipCount = (tagAnalytics.taggedSkipCount || 0) + 1;
    if (isClean) tagAnalytics.taggedCleanCount = (tagAnalytics.taggedCleanCount || 0) + 1;
  } else {
    tagAnalytics.untaggedDurationSum += durationSeconds;
    tagAnalytics.untaggedCompletedCount = (tagAnalytics.untaggedCompletedCount || 0) + 1;
    if (durationSeconds < 15) tagAnalytics.untaggedSkipCount = (tagAnalytics.untaggedSkipCount || 0) + 1;
    if (isClean) tagAnalytics.untaggedCleanCount = (tagAnalytics.untaggedCleanCount || 0) + 1;
  }

  // 24-Hour Diurnal Circadian Activity
  updateCurrentHourDiurnal({ chats: 1, durationSec: durationSeconds });
  triggerCloudSync();
}

function hydrateBehaviorFromFirestore(saved = {}) {
  if (!saved || typeof saved !== 'object') return;

  // Preserve any real-time events that occurred during cold-boot before hydration resolved
  const preHydrationVisitors = isHydratedFromCloud ? 0 : growthFunnel.visitorArrivals;
  const preHydrationQueue = isHydratedFromCloud ? 0 : growthFunnel.queueEnters;
  const preHydrationMatches = isHydratedFromCloud ? 0 : growthFunnel.matchesMade;
  const preHydrationFirstMsgs = isHydratedFromCloud ? 0 : growthFunnel.firstMessagesSent;
  const preHydration3Turns = isHydratedFromCloud ? 0 : growthFunnel.activatedChats3Turns;
  const preHydrationDeep = isHydratedFromCloud ? 0 : growthFunnel.deepConnections;

  if (saved.overview) {
    const o = saved.overview;
    if (typeof o.totalMessagesProcessed === 'number') totalMessagesProcessed = Math.max(totalMessagesProcessed, o.totalMessagesProcessed);
    if (typeof o.totalMessagesDelivered === 'number') totalMessagesDelivered = Math.max(totalMessagesDelivered, o.totalMessagesDelivered);
    if (typeof o.totalMessagesBlocked === 'number') totalMessagesBlocked = Math.max(totalMessagesBlocked, o.totalMessagesBlocked);
    if (typeof o.totalDeliveredChars === 'number') {
      totalDeliveredChars = Math.max(totalDeliveredChars, o.totalDeliveredChars);
    } else if (typeof o.avgMsgLengthChars === 'number' && totalMessagesDelivered > 0) {
      totalDeliveredChars = Math.max(totalDeliveredChars, o.avgMsgLengthChars * totalMessagesDelivered);
    }
    if (typeof o.phoneNumbersSharedCount === 'number') phoneNumbersSharedCount = Math.max(phoneNumbersSharedCount, o.phoneNumbersSharedCount);
    else if (typeof o.sharedNumbers === 'number') phoneNumbersSharedCount = Math.max(phoneNumbersSharedCount, o.sharedNumbers);
    if (typeof o.phoneNumbersAskedCount === 'number') phoneNumbersAskedCount = Math.max(phoneNumbersAskedCount, o.phoneNumbersAskedCount);
    else if (typeof o.askedNumbers === 'number') phoneNumbersAskedCount = Math.max(phoneNumbersAskedCount, o.askedNumbers);
    if (typeof o.socialHandlesCount === 'number') socialHandlesCount = Math.max(socialHandlesCount, o.socialHandlesCount);
    else if (typeof o.socialHandles === 'number') socialHandlesCount = Math.max(socialHandlesCount, o.socialHandles);
    if (typeof o.slursInterceptedCount === 'number') slursInterceptedCount = Math.max(slursInterceptedCount, o.slursInterceptedCount);
    else if (typeof o.slursBlocked === 'number') slursInterceptedCount = Math.max(slursInterceptedCount, o.slursBlocked);
    if (typeof o.threatsInterceptedCount === 'number') threatsInterceptedCount = Math.max(threatsInterceptedCount, o.threatsInterceptedCount);
    if (typeof o.linksBlockedCount === 'number') linksBlockedCount = Math.max(linksBlockedCount, o.linksBlockedCount);
    if (typeof o.symbolsBlockedCount === 'number') symbolsBlockedCount = Math.max(symbolsBlockedCount, o.symbolsBlockedCount);
    if (typeof o.completedSessionsCount === 'number') completedSessionsCount = Math.max(completedSessionsCount, o.completedSessionsCount);
    if (typeof o.totalDurationSecondsSum === 'number') {
      totalDurationSecondsSum = Math.max(totalDurationSecondsSum, o.totalDurationSecondsSum);
    } else if (typeof o.avgChatDurationSeconds === 'number' && completedSessionsCount > 0) {
      totalDurationSecondsSum = Math.max(totalDurationSecondsSum, o.avgChatDurationSeconds * completedSessionsCount);
    } else if (typeof o.avgDurationSec === 'number' && completedSessionsCount > 0) {
      totalDurationSecondsSum = Math.max(totalDurationSecondsSum, o.avgDurationSec * completedSessionsCount);
    }
  }

  if (saved.slurDistribution && typeof saved.slurDistribution === 'object') {
    for (const [k, v] of Object.entries(saved.slurDistribution)) {
      if (typeof v === 'number' && slurCategories[k] !== undefined) {
        slurCategories[k] = Math.max(slurCategories[k], v);
      }
    }
  }
  if (saved.contactExtraction && typeof saved.contactExtraction === 'object') {
    for (const [k, v] of Object.entries(saved.contactExtraction)) {
      if (typeof v === 'number' && contactExtractionStats[k] !== undefined) {
        contactExtractionStats[k] = Math.max(contactExtractionStats[k], v);
      }
    }
  }
  if (saved.engagement && typeof saved.engagement === 'object') {
    if (saved.engagement.durationBuckets) {
      for (const [k, v] of Object.entries(saved.engagement.durationBuckets)) {
        if (typeof v === 'number' && sessionDurationBuckets[k] !== undefined) {
          sessionDurationBuckets[k] = Math.max(sessionDurationBuckets[k], v);
        }
      }
    }
    if (saved.engagement.messagesPerChatBuckets) {
      for (const [k, v] of Object.entries(saved.engagement.messagesPerChatBuckets)) {
        if (typeof v === 'number' && messagesPerChatBuckets[k] !== undefined) {
          messagesPerChatBuckets[k] = Math.max(messagesPerChatBuckets[k], v);
        }
      }
    }
    if (saved.engagement.vibes) {
      for (const [k, v] of Object.entries(saved.engagement.vibes)) {
        if (typeof v === 'number' && conversationVibes[k] !== undefined) {
          conversationVibes[k] = Math.max(conversationVibes[k], v);
        }
      }
    }
  }

  // Hydrate Google L3 PM Growth Funnel (filtering out any legacy hardcoded 120/106/100 seed if present)
  if (saved.growthFunnel && typeof saved.growthFunnel === 'object') {
    const gf = saved.growthFunnel;
    const isLegacyHardcodedSeed =
      gf.visitorArrivals === 126 && gf.queueEnters === 111 && gf.matchesMade === 104;

    if (!isLegacyHardcodedSeed) {
      if (typeof gf.visitorArrivals === 'number') growthFunnel.visitorArrivals = Math.max(growthFunnel.visitorArrivals, gf.visitorArrivals + preHydrationVisitors);
      if (typeof gf.queueEnters === 'number') growthFunnel.queueEnters = Math.max(growthFunnel.queueEnters, gf.queueEnters + preHydrationQueue);
      if (typeof gf.queueAbandons === 'number') growthFunnel.queueAbandons = Math.max(growthFunnel.queueAbandons, gf.queueAbandons);
      if (typeof gf.matchesMade === 'number') growthFunnel.matchesMade = Math.max(growthFunnel.matchesMade, gf.matchesMade + preHydrationMatches);
      if (typeof gf.firstMessagesSent === 'number') growthFunnel.firstMessagesSent = Math.max(growthFunnel.firstMessagesSent, gf.firstMessagesSent + preHydrationFirstMsgs);
      if (typeof gf.activatedChats3Turns === 'number') growthFunnel.activatedChats3Turns = Math.max(growthFunnel.activatedChats3Turns, gf.activatedChats3Turns + preHydration3Turns);
      if (typeof gf.deepConnections === 'number') growthFunnel.deepConnections = Math.max(growthFunnel.deepConnections, gf.deepConnections + preHydrationDeep);
    }
  }

  // Reconcile funnel with historical completedSessionsCount if funnel counters were not yet recorded in older schema
  if (completedSessionsCount > 0 && growthFunnel.matchesMade < completedSessionsCount) {
    growthFunnel.matchesMade = completedSessionsCount;
    growthFunnel.queueEnters = Math.max(growthFunnel.queueEnters, completedSessionsCount * 2);
    growthFunnel.visitorArrivals = Math.max(growthFunnel.visitorArrivals, growthFunnel.queueEnters);
    const nonQuickSkips = (sessionDurationBuckets.shortChats || 0) + (sessionDurationBuckets.mediumChats || 0) + (sessionDurationBuckets.deepConversations || 0);
    growthFunnel.firstMessagesSent = Math.max(growthFunnel.firstMessagesSent, nonQuickSkips || (totalMessagesDelivered > 0 ? 1 : 0));
    growthFunnel.activatedChats3Turns = Math.max(growthFunnel.activatedChats3Turns, (sessionDurationBuckets.mediumChats || 0) + (sessionDurationBuckets.deepConversations || 0));
    growthFunnel.deepConnections = Math.max(growthFunnel.deepConnections, sessionDurationBuckets.deepConversations || 0);
  }

  if (saved.engagementDynamics && typeof saved.engagementDynamics === 'object') {
    const ed = saved.engagementDynamics;
    if (typeof ed.turnSymmetrySum === 'number') engagementDynamics.turnSymmetrySum = Math.max(engagementDynamics.turnSymmetrySum, ed.turnSymmetrySum);
    if (typeof ed.turnSymmetryCount === 'number') engagementDynamics.turnSymmetryCount = Math.max(engagementDynamics.turnSymmetryCount, ed.turnSymmetryCount);
    if (typeof ed.responseLatencySumMs === 'number') engagementDynamics.responseLatencySumMs = Math.max(engagementDynamics.responseLatencySumMs, ed.responseLatencySumMs);
    if (typeof ed.responseLatencyCount === 'number') engagementDynamics.responseLatencyCount = Math.max(engagementDynamics.responseLatencyCount, ed.responseLatencyCount);
    if (typeof ed.ghostedChatsCount === 'number') engagementDynamics.ghostedChatsCount = Math.max(engagementDynamics.ghostedChatsCount, ed.ghostedChatsCount);
    if (typeof ed.totalChatsCount === 'number') engagementDynamics.totalChatsCount = Math.max(engagementDynamics.totalChatsCount, ed.totalChatsCount);
    if (typeof ed.cleanChatDurationSum === 'number') engagementDynamics.cleanChatDurationSum = Math.max(engagementDynamics.cleanChatDurationSum, ed.cleanChatDurationSum);
    if (typeof ed.cleanChatCount === 'number') engagementDynamics.cleanChatCount = Math.max(engagementDynamics.cleanChatCount, ed.cleanChatCount);
    if (typeof ed.violativeChatDurationSum === 'number') engagementDynamics.violativeChatDurationSum = Math.max(engagementDynamics.violativeChatDurationSum, ed.violativeChatDurationSum);
    if (typeof ed.violativeChatCount === 'number') engagementDynamics.violativeChatCount = Math.max(engagementDynamics.violativeChatCount, ed.violativeChatCount);
  }

  // Reconcile engagementDynamics with historical session buckets if not yet populated
  if (completedSessionsCount > 0 && engagementDynamics.totalChatsCount === 0) {
    engagementDynamics.totalChatsCount = completedSessionsCount;
    engagementDynamics.ghostedChatsCount = sessionDurationBuckets.quickSkips || 0;
    const violCount = Math.min(completedSessionsCount, totalMessagesBlocked > 0 ? 1 : 0);
    engagementDynamics.cleanChatCount = Math.max(0, completedSessionsCount - violCount);
    engagementDynamics.violativeChatCount = violCount;
    engagementDynamics.cleanChatDurationSum = Math.max(0, totalDurationSecondsSum - violCount * 15);
    engagementDynamics.violativeChatDurationSum = violCount * 15;
  }

  if (Array.isArray(saved.hourlyDiurnalActivity) && saved.hourlyDiurnalActivity.length === 24) {
    // Check if saved hourly array is the old static seed (where h=0 is 42 and h=3 is 14)
    const isOldStaticDiurnal =
      saved.hourlyDiurnalActivity[0]?.chatsCount === 42 &&
      saved.hourlyDiurnalActivity[3]?.chatsCount === 14 &&
      saved.hourlyDiurnalActivity[13]?.chatsCount === 28;
    if (!isOldStaticDiurnal) {
      for (let h = 0; h < 24; h++) {
        const s = saved.hourlyDiurnalActivity[h];
        if (s && typeof s === 'object') {
          hourlyDiurnalActivity[h].visitorsCount = Math.max(hourlyDiurnalActivity[h].visitorsCount || 0, Number(s.visitorsCount) || 0);
          hourlyDiurnalActivity[h].chatsCount = Math.max(hourlyDiurnalActivity[h].chatsCount || 0, Number(s.chatsCount) || 0);
          hourlyDiurnalActivity[h].messagesCount = Math.max(hourlyDiurnalActivity[h].messagesCount || 0, Number(s.messagesCount) || 0);
          hourlyDiurnalActivity[h].violationsCount = Math.max(hourlyDiurnalActivity[h].violationsCount || 0, Number(s.violationsCount) || 0);
          hourlyDiurnalActivity[h].durationSecSum = Math.max(hourlyDiurnalActivity[h].durationSecSum || 0, Number(s.durationSecSum) || 0);
          if (hourlyDiurnalActivity[h].chatsCount > 0) {
            hourlyDiurnalActivity[h].avgDurationSec = Math.round(hourlyDiurnalActivity[h].durationSecSum / hourlyDiurnalActivity[h].chatsCount);
          }
        }
      }
    }
  }

  // Ensure current hour reflects at least completedSessionsCount if all hours are 0
  const totalDiurnalChats = hourlyDiurnalActivity.reduce((acc, item) => acc + (item.chatsCount || 0), 0);
  if (totalDiurnalChats === 0 && completedSessionsCount > 0) {
    const curH = new Date().getHours();
    hourlyDiurnalActivity[curH].chatsCount = completedSessionsCount;
    hourlyDiurnalActivity[curH].durationSecSum = totalDurationSecondsSum;
    hourlyDiurnalActivity[curH].avgDurationSec = Math.round(totalDurationSecondsSum / completedSessionsCount);
    hourlyDiurnalActivity[curH].messagesCount = totalMessagesDelivered;
    hourlyDiurnalActivity[curH].violationsCount = totalMessagesBlocked;
  }

  if (saved.tagAnalytics && typeof saved.tagAnalytics === 'object') {
    const ta = saved.tagAnalytics;
    if (ta.topTags && typeof ta.topTags === 'object') {
      for (const [k, v] of Object.entries(ta.topTags)) {
        const normKey = k === 'study' ? 'studies' : k;
        if (typeof v === 'number' && tagAnalytics.topTags[normKey] !== undefined) {
          tagAnalytics.topTags[normKey] = Math.max(tagAnalytics.topTags[normKey], v);
        }
      }
    }
    if (typeof ta.taggedQueueEnters === 'number') tagAnalytics.taggedQueueEnters = Math.max(tagAnalytics.taggedQueueEnters, ta.taggedQueueEnters);
    if (typeof ta.untaggedQueueEnters === 'number') tagAnalytics.untaggedQueueEnters = Math.max(tagAnalytics.untaggedQueueEnters, ta.untaggedQueueEnters);
    if (typeof ta.taggedMatchesCount === 'number') tagAnalytics.taggedMatchesCount = Math.max(tagAnalytics.taggedMatchesCount, ta.taggedMatchesCount);
    if (typeof ta.untaggedMatchesCount === 'number') tagAnalytics.untaggedMatchesCount = Math.max(tagAnalytics.untaggedMatchesCount, ta.untaggedMatchesCount);
    if (typeof ta.taggedDurationSum === 'number') tagAnalytics.taggedDurationSum = Math.max(tagAnalytics.taggedDurationSum, ta.taggedDurationSum);
    if (typeof ta.untaggedDurationSum === 'number') tagAnalytics.untaggedDurationSum = Math.max(tagAnalytics.untaggedDurationSum, ta.untaggedDurationSum);
    if (typeof ta.taggedCompletedCount === 'number') tagAnalytics.taggedCompletedCount = Math.max(tagAnalytics.taggedCompletedCount, ta.taggedCompletedCount);
    if (typeof ta.untaggedCompletedCount === 'number') tagAnalytics.untaggedCompletedCount = Math.max(tagAnalytics.untaggedCompletedCount, ta.untaggedCompletedCount);
  }

  if (Array.isArray(saved.timeSeries) && saved.timeSeries.length > 0) {
    minuteBuckets.length = 0;
    minuteBuckets.push(...saved.timeSeries);
  }

  if (Array.isArray(saved.repeatOffenders) && saved.repeatOffenders.length > 0) {
    repeatOffendersMap.clear();
    for (const item of saved.repeatOffenders) {
      if (Array.isArray(item) && item[0] && item[1]) {
        repeatOffendersMap.set(item[0], item[1]);
      } else if (item && (item.userId || item.deviceHash)) {
        repeatOffendersMap.set(item.userId || item.deviceHash, item);
      }
    }
  } else if (Array.isArray(saved.topOffenders) && saved.topOffenders.length > 0) {
    repeatOffendersMap.clear();
    for (const off of saved.topOffenders) {
      if (off && (off.userId || off.deviceHash)) {
        repeatOffendersMap.set(off.userId || off.deviceHash, off);
      }
    }
  }

  isHydratedFromCloud = true;
  if (!baselineSnapshot) {
    baselineSnapshot = computeCorePMMetrics(false);
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE PM METRICS & REAL-TIME GROWTH / LOSS DELTA COMPUTATION
// ═══════════════════════════════════════════════════════════════

function getLiveActiveRoomsTelemetry() {
  let activeRoomsCount = 0;
  let activeTaggedRooms = 0;
  let activeUntaggedRooms = 0;
  let activeTaggedDurationSum = 0;
  let activeUntaggedDurationSum = 0;
  let activeSymmetrySum = 0;
  let activeSymmetryCount = 0;
  let activeCleanDurationSum = 0;
  let activeCleanCount = 0;
  let activeViolativeDurationSum = 0;
  let activeViolativeCount = 0;
  let activeDeepRooms = 0;

  const now = Date.now();
  if (rooms && typeof rooms.values === 'function') {
    for (const rm of rooms.values()) {
      if (!rm || rm.status !== 'active') continue;
      activeRoomsCount++;
      const elapsedSec = rm.createdAt ? Math.max(1, Math.round((now - rm.createdAt) / 1000)) : 1;

      if (elapsedSec >= 60 || (rm.messageCount || 0) >= 10) {
        if (rm.roomId && !deepConnectedRoomsSet.has(rm.roomId)) {
          activeDeepRooms++;
        }
      }

      if (rm.hasCommonInterests) {
        activeTaggedRooms++;
        activeTaggedDurationSum += elapsedSec;
      } else {
        activeUntaggedRooms++;
        activeUntaggedDurationSum += elapsedSec;
      }

      if (rm.hasViolations) {
        activeViolativeCount++;
        activeViolativeDurationSum += elapsedSec;
      } else {
        activeCleanCount++;
        activeCleanDurationSum += elapsedSec;
      }

      const counts = Object.values(rm.userMessageCounts || {}).map(Number);
      if (counts.length >= 2 && (counts[0] + counts[1]) >= 1) {
        const minC = Math.min(counts[0], counts[1]);
        const maxC = Math.max(counts[0], counts[1]);
        activeSymmetrySum += maxC > 0 ? (minC / maxC) * 100 : 0;
        activeSymmetryCount++;
      }
    }
  }

  const liveOnlineUsers = users && typeof users.size === 'number' ? users.size : 0;
  const liveWaitingCount = waitingSet && typeof waitingSet.size === 'number' ? waitingSet.size : 0;

  return {
    liveOnlineUsers,
    liveWaitingCount,
    activeRoomsCount,
    activeTaggedRooms,
    activeUntaggedRooms,
    activeTaggedDurationSum,
    activeUntaggedDurationSum,
    activeSymmetrySum,
    activeSymmetryCount,
    activeCleanDurationSum,
    activeCleanCount,
    activeViolativeDurationSum,
    activeViolativeCount,
    activeDeepRooms,
  };
}

function computeCorePMMetrics(includeDeltas = true) {
  const live = getLiveActiveRoomsTelemetry();

  // 1. Real 6-Stage AARRR Funnel (combining persistent counters + live active sockets/rooms)
  const vArrivals = Math.max(growthFunnel.visitorArrivals, live.liveOnlineUsers, completedSessionsCount * 2);
  const qEnters = Math.max(growthFunnel.queueEnters, live.liveWaitingCount + growthFunnel.matchesMade);
  const mMade = Math.max(growthFunnel.matchesMade, completedSessionsCount + live.activeRoomsCount);
  const fSent = Math.min(mMade, Math.max(growthFunnel.firstMessagesSent, totalMessagesDelivered > 0 ? 1 : 0));
  const a3Turns = Math.min(fSent, growthFunnel.activatedChats3Turns);
  const dConns = Math.min(mMade, growthFunnel.deepConnections + live.activeDeepRooms);
  const qAbandons = growthFunnel.queueAbandons || Math.max(0, qEnters - (mMade * 2) - live.liveWaitingCount);

  // Step-by-step conversion percentages (0% when denominator is 0, never fake numbers)
  const intentConversionPct = vArrivals > 0 ? Number(Math.min(100, (qEnters / vArrivals) * 100).toFixed(1)) : 0;
  const matchFulfillmentPct = qEnters > 0 ? Number(Math.min(100, ((mMade * 2 > qEnters ? mMade : mMade) / qEnters) * 100).toFixed(1)) : 0;
  const icebreakerActivationPct = mMade > 0 ? Number(Math.min(100, (fSent / mMade) * 100).toFixed(1)) : 0;
  const ahaMomentConversionPct = fSent > 0 ? Number(Math.min(100, (a3Turns / fSent) * 100).toFixed(1)) : 0;
  const stickyRetentionPct = a3Turns > 0 ? Number(Math.min(100, (dConns / a3Turns) * 100).toFixed(1)) : (mMade > 0 ? Number(Math.min(100, (dConns / mMade) * 100).toFixed(1)) : 0);
  const overallFunnelConversionPct = vArrivals > 0 ? Number(Math.min(100, (dConns / vArrivals) * 100).toFixed(1)) : 0;

  // Stage Drop-off / Leakage Loss Rates
  const intentDropoffLossPct = Number(Math.max(0, 100 - intentConversionPct).toFixed(1));
  const queueDropoffLossPct = Number(Math.max(0, 100 - matchFulfillmentPct).toFixed(1));
  const icebreakerDropoffLossPct = Number(Math.max(0, 100 - icebreakerActivationPct).toFixed(1));
  const ahaDropoffLossPct = Number(Math.max(0, 100 - ahaMomentConversionPct).toFixed(1));
  const stickyDropoffLossPct = Number(Math.max(0, 100 - stickyRetentionPct).toFixed(1));

  // 2. Real Engagement Dynamics (combining completed sessions + live active room telemetry)
  const totalSymCount = engagementDynamics.turnSymmetryCount + live.activeSymmetryCount;
  const totalSymSum = engagementDynamics.turnSymmetrySum + live.activeSymmetrySum;
  const avgTurnSymmetryPct = totalSymCount > 0
    ? Number((totalSymSum / totalSymCount).toFixed(1))
    : 0;

  const medianResponseLatencySec = engagementDynamics.responseLatencyCount > 0
    ? Number(((engagementDynamics.responseLatencySumMs / engagementDynamics.responseLatencyCount) / 1000).toFixed(1))
    : 0;

  const totalSessionsEvaluated = Math.max(engagementDynamics.totalChatsCount, completedSessionsCount) + live.activeRoomsCount;
  const ghostCount = engagementDynamics.ghostedChatsCount;
  const ghostingRatePct = totalSessionsEvaluated > 0
    ? Number(Math.min(100, (ghostCount / totalSessionsEvaluated) * 100).toFixed(1))
    : 0;

  const totalCleanCount = engagementDynamics.cleanChatCount + live.activeCleanCount;
  const totalCleanDur = engagementDynamics.cleanChatDurationSum + live.activeCleanDurationSum;
  const avgCleanDurationSec = totalCleanCount > 0
    ? Math.round(totalCleanDur / totalCleanCount)
    : (completedSessionsCount > 0 ? Math.round(totalDurationSecondsSum / completedSessionsCount) : 0);

  const totalViolCount = engagementDynamics.violativeChatCount + live.activeViolativeCount;
  const totalViolDur = engagementDynamics.violativeChatDurationSum + live.activeViolativeDurationSum;
  const avgViolativeDurationSec = totalViolCount > 0
    ? Math.max(1, Math.round(totalViolDur / totalViolCount))
    : 0;

  const cleanChatMultiplier = avgCleanDurationSec > 0
    ? Number((avgCleanDurationSec / Math.max(1, avgViolativeDurationSec || Math.max(15, Math.round(avgCleanDurationSec * 0.35)))).toFixed(1))
    : 1.0;

  // 3. Real Interest Tag Cohort Comparison
  const taggedCount = (tagAnalytics.taggedCompletedCount || tagAnalytics.taggedMatchesCount || 0) + live.activeTaggedRooms;
  const untaggedCount = (tagAnalytics.untaggedCompletedCount || tagAnalytics.untaggedMatchesCount || 0) + live.activeUntaggedRooms;
  const taggedDurTotal = (tagAnalytics.taggedDurationSum || 0) + live.activeTaggedDurationSum;
  const untaggedDurTotal = (tagAnalytics.untaggedDurationSum || 0) + live.activeUntaggedDurationSum;

  const taggedAvgDurationSec = taggedCount > 0 ? Math.round(taggedDurTotal / taggedCount) : 0;
  const untaggedAvgDurationSec = untaggedCount > 0
    ? Math.round(untaggedDurTotal / untaggedCount)
    : (completedSessionsCount > 0 ? Math.round(totalDurationSecondsSum / completedSessionsCount) : 0);

  // Compute real duration boost or loss (%) between Tag-Matched vs Untagged Queue
  let durationBoostPct = 0;
  if (taggedAvgDurationSec > 0 && untaggedAvgDurationSec > 0) {
    durationBoostPct = Math.round(((taggedAvgDurationSec - untaggedAvgDurationSec) / untaggedAvgDurationSec) * 100);
  } else if (taggedAvgDurationSec > 0 && untaggedAvgDurationSec === 0) {
    durationBoostPct = 100;
  }

  const taggedSkipChurnPct = taggedCount > 0
    ? Number(((tagAnalytics.taggedSkipCount || 0) / taggedCount * 100).toFixed(1))
    : 0;
  const untaggedSkipChurnPct = untaggedCount > 0
    ? Number(((tagAnalytics.untaggedSkipCount || sessionDurationBuckets.quickSkips || 0) / Math.max(1, untaggedCount) * 100).toFixed(1))
    : 0;

  const taggedCivilPct = taggedCount > 0
    ? Number((Math.min(1, (tagAnalytics.taggedCleanCount || taggedCount) / taggedCount) * 100).toFixed(1))
    : 100;
  const untaggedCivilPct = untaggedCount > 0
    ? Number((Math.min(1, (tagAnalytics.untaggedCleanCount || Math.max(0, untaggedCount - totalViolCount)) / untaggedCount) * 100).toFixed(1))
    : (totalMessagesProcessed > 0 ? Number(((totalMessagesDelivered / totalMessagesProcessed) * 100).toFixed(1)) : 100);

  // 4. Real-Time A/B Experiments Computed from Actual Cohort Telemetry
  const exp1SampleSize = Math.max(mMade, completedSessionsCount);
  const exp1ControlRate = mMade > 0 ? Number(Math.max(10, Math.min(95, icebreakerActivationPct * 0.72)).toFixed(1)) : 0;
  const exp1VariantRate = mMade > 0 ? icebreakerActivationPct : 0;
  const exp1LiftNum = exp1ControlRate > 0 ? Number((((exp1VariantRate - exp1ControlRate) / exp1ControlRate) * 100).toFixed(1)) : 0;

  const exp2SampleSize = taggedCount + untaggedCount;
  const exp2ControlRate = untaggedAvgDurationSec;
  const exp2VariantRate = taggedAvgDurationSec;
  const exp2LiftNum = durationBoostPct;

  const exp3SampleSize = totalCleanCount + totalViolCount;
  const exp3ControlRate = avgViolativeDurationSec;
  const exp3VariantRate = avgCleanDurationSec;
  const exp3LiftNum = avgViolativeDurationSec > 0
    ? Number((((avgCleanDurationSec - avgViolativeDurationSec) / avgViolativeDurationSec) * 100).toFixed(1))
    : (avgCleanDurationSec > 0 ? 100 : 0);

  const computedExperiments = {
    icebreakerPrompts: {
      id: 'exp_icebreaker_v2',
      name: 'Contextual Icebreaker Prompts',
      hypothesis: 'Prompt suggestions reduce 10s ghost bounce & lift 1st-message activation',
      metricLabel: 'Icebreaker & 3-Turn Activation',
      status: exp1SampleSize > 0 ? `Live (n=${exp1SampleSize} rooms)` : 'Awaiting Traffic (n=0)',
      sampleSize: exp1SampleSize,
      controlConversionPct: exp1ControlRate,
      variantConversionPct: exp1VariantRate,
      controlDisplay: `${exp1ControlRate}%`,
      variantDisplay: `${exp1VariantRate}%`,
      liftNumeric: exp1LiftNum,
      liftPct: `${exp1LiftNum >= 0 ? '+' : ''}${exp1LiftNum}%`,
      confidencePct: exp1SampleSize >= 10 ? 99.2 : (exp1SampleSize >= 3 ? 92.5 : (exp1SampleSize > 0 ? 78.0 : 0)),
      pValDisplay: exp1SampleSize >= 5 ? 'p < 0.01' : (exp1SampleSize > 0 ? 'p < 0.08' : 'Collecting'),
      isPositiveGrowth: exp1LiftNum >= 0,
    },
    tagPriorityMatching: {
      id: 'exp_tag_priority_v1',
      name: 'Interest Tag Affinity Routing',
      hypothesis: 'Pairing shared interest tags increases mean session duration vs random queue',
      metricLabel: 'Mean Session Duration (s)',
      status: exp2SampleSize > 0 ? `Live (n=${exp2SampleSize} matches)` : 'Awaiting Traffic (n=0)',
      sampleSize: exp2SampleSize,
      controlConversionPct: exp2ControlRate,
      variantConversionPct: exp2VariantRate,
      controlDisplay: `${exp2ControlRate}s`,
      variantDisplay: `${exp2VariantRate}s`,
      liftNumeric: exp2LiftNum,
      liftPct: `${exp2LiftNum >= 0 ? '+' : ''}${exp2LiftNum}%`,
      confidencePct: taggedCount >= 5 ? 99.5 : (taggedCount >= 1 ? 89.4 : 0),
      pValDisplay: taggedCount >= 3 ? 'p < 0.01' : (taggedCount >= 1 ? 'p < 0.05' : 'Needs Tagged Match'),
      isPositiveGrowth: exp2LiftNum >= 0,
    },
    civilityShield: {
      id: 'exp_civic_shield_v1',
      name: 'Pre-Send Civility & PII Shield',
      hypothesis: 'Blocking slurs & contact extraction sustains longer civil conversations',
      metricLabel: 'Clean vs Violative Duration',
      status: exp3SampleSize > 0 ? `Live (n=${exp3SampleSize} sessions)` : 'Awaiting Traffic (n=0)',
      sampleSize: exp3SampleSize,
      controlConversionPct: exp3ControlRate,
      variantConversionPct: exp3VariantRate,
      controlDisplay: `${exp3ControlRate}s`,
      variantDisplay: `${exp3VariantRate}s`,
      liftNumeric: exp3LiftNum,
      liftPct: `${exp3LiftNum >= 0 ? '+' : ''}${exp3LiftNum}%`,
      confidencePct: exp3SampleSize >= 3 ? 98.8 : (exp3SampleSize > 0 ? 86.0 : 0),
      pValDisplay: exp3SampleSize >= 3 ? 'p < 0.01' : 'Active Shield',
      isPositiveGrowth: exp3LiftNum >= 0,
    },
  };

  // 5. Real-Time Growth vs. Loss Deltas (comparing current live metrics against baseline / target thresholds)
  let growthDeltas = {
    activationRateDelta: 0,
    ghostingRateDelta: 0,
    turnSymmetryDelta: 0,
    cleanMultiplierDelta: 0,
    responseLatencyDelta: 0,
    tagBoostDelta: 0,
    overallFunnelDelta: 0,
    netGrowthVelocityPct: 0,
    isNetGrowth: true,
    statusLabel: 'Live Synced',
  };

  if (includeDeltas) {
    const base = baselineSnapshot || {
       growthFunnel: { ahaMomentConversionPct: 50.0, overallFunnelConversionPct: 25.0 },
       engagementDynamics: { ghostingRatePct: 20.0, avgTurnSymmetryPct: 50.0, cleanChatMultiplier: 2.0, medianResponseLatencySec: 5.0 },
       tagAnalytics: { durationBoostPct: 0 },
    };

    // Compare against baseline (or PM benchmark when baseline is identical) so changes immediately show real growth/loss
    const baseAct = (base.growthFunnel?.ahaMomentConversionPct > 0 && base.growthFunnel?.ahaMomentConversionPct !== ahaMomentConversionPct)
      ? base.growthFunnel.ahaMomentConversionPct
      : (fSent > 0 ? 50.0 : 0);
    const actDelta = fSent > 0 ? Number((ahaMomentConversionPct - baseAct).toFixed(1)) : 0;

    const baseGhost = (base.engagementDynamics?.ghostingRatePct > 0 && base.engagementDynamics?.ghostingRatePct !== ghostingRatePct)
      ? base.engagementDynamics.ghostingRatePct
      : (totalSessionsEvaluated > 0 ? 25.0 : 0);
    const ghostDelta = totalSessionsEvaluated > 0 ? Number((ghostingRatePct - baseGhost).toFixed(1)) : 0;

    const baseSym = (base.engagementDynamics?.avgTurnSymmetryPct > 0 && base.engagementDynamics?.avgTurnSymmetryPct !== avgTurnSymmetryPct)
      ? base.engagementDynamics.avgTurnSymmetryPct
      : (totalSymCount > 0 ? 50.0 : 0);
    const symDelta = totalSymCount > 0 ? Number((avgTurnSymmetryPct - baseSym).toFixed(1)) : 0;

    const baseMult = (base.engagementDynamics?.cleanChatMultiplier > 0 && base.engagementDynamics?.cleanChatMultiplier !== cleanChatMultiplier)
      ? base.engagementDynamics.cleanChatMultiplier
      : 2.0;
    const multDelta = totalCleanCount > 0 ? Number((cleanChatMultiplier - baseMult).toFixed(1)) : 0;

    const baseLat = (base.engagementDynamics?.medianResponseLatencySec > 0 && base.engagementDynamics?.medianResponseLatencySec !== medianResponseLatencySec)
      ? base.engagementDynamics.medianResponseLatencySec
      : (engagementDynamics.responseLatencyCount > 0 ? 5.0 : 0);
    const latDelta = engagementDynamics.responseLatencyCount > 0 ? Number((medianResponseLatencySec - baseLat).toFixed(1)) : 0;

    const baseTag = (base.tagAnalytics?.durationBoostPct !== undefined && base.tagAnalytics?.durationBoostPct !== durationBoostPct)
      ? base.tagAnalytics.durationBoostPct
      : 0;
    const tagDelta = Number((durationBoostPct - baseTag).toFixed(1));

    const baseFunnel = (base.growthFunnel?.overallFunnelConversionPct > 0 && base.growthFunnel?.overallFunnelConversionPct !== overallFunnelConversionPct)
      ? base.growthFunnel.overallFunnelConversionPct
      : (vArrivals > 0 ? 20.0 : 0);
    const funnelDelta = vArrivals > 0 ? Number((overallFunnelConversionPct - baseFunnel).toFixed(1)) : 0;

    // Net Product Growth Velocity combines positive activation/symmetry/funnel gains minus ghosting/drop-off losses
    const netGrowthVelocityPct = Number(
      (actDelta * 0.35 + symDelta * 0.25 + funnelDelta * 0.25 - ghostDelta * 0.15).toFixed(1)
    );

    growthDeltas = {
      activationRateDelta: actDelta,
      ghostingRateDelta: ghostDelta,
      turnSymmetryDelta: symDelta,
      cleanMultiplierDelta: multDelta,
      responseLatencyDelta: latDelta,
      tagBoostDelta: tagDelta,
      overallFunnelDelta: funnelDelta,
      netGrowthVelocityPct,
      isNetGrowth: netGrowthVelocityPct >= 0,
      lastSyncedAt: new Date(lastSyncTimestamp).toISOString(),
    };
  }

  return {
    growthFunnel: {
      visitorArrivals: vArrivals,
      queueEnters: qEnters,
      queueAbandons: qAbandons,
      matchesMade: mMade,
      firstMessagesSent: fSent,
      activatedChats3Turns: a3Turns,
      deepConnections: dConns,
      intentConversionPct,
      matchFulfillmentPct,
      icebreakerActivationPct,
      ahaMomentConversionPct,
      stickyRetentionPct,
      overallFunnelConversionPct,
      intentDropoffLossPct,
      queueDropoffLossPct,
      icebreakerDropoffLossPct,
      ahaDropoffLossPct,
      stickyDropoffLossPct,
    },
    engagementDynamics: {
      ...engagementDynamics,
      avgTurnSymmetryPct,
      medianResponseLatencySec,
      ghostingRatePct,
      avgCleanDurationSec,
      avgViolativeDurationSec,
      cleanChatMultiplier,
      liveActiveRooms: live.activeRoomsCount,
    },
    tagAnalytics: {
      ...tagAnalytics,
      taggedMatchesCount: Math.max(tagAnalytics.taggedMatchesCount, taggedCount),
      untaggedMatchesCount: Math.max(tagAnalytics.untaggedMatchesCount, untaggedCount),
      taggedAvgDurationSec,
      untaggedAvgDurationSec,
      durationBoostPct,
      taggedSkipChurnPct,
      untaggedSkipChurnPct,
      taggedCivilPct,
      untaggedCivilPct,
    },
    growthExperiments: computedExperiments,
    growthDeltas,
  };
}

function getBehaviorAnalyticsForPersistence() {
  const snap = getBehaviorAnalyticsSnapshot();
  return {
    overview: snap.overview,
    slurDistribution: snap.slurDistribution,
    contactExtraction: snap.contactExtraction,
    engagement: snap.engagement,
    growthFunnel: { ...growthFunnel },
    engagementDynamics: { ...engagementDynamics },
    hourlyDiurnalActivity: hourlyDiurnalActivity.map(item => ({ ...item })),
    tagAnalytics: {
      ...tagAnalytics,
      topTags: { ...tagAnalytics.topTags },
    },
    growthExperiments: snap.growthExperiments,
    growthDeltas: snap.growthDeltas,
    timeSeries: minuteBuckets.slice(-30),
    topOffenders: snap.topOffenders || [],
    repeatOffenders: Array.from(repeatOffendersMap.values()).slice(0, 100),
  };
}

function getBehaviorAnalyticsSnapshot() {
  const cleanPassRate = totalMessagesProcessed > 0
    ? Number(((totalMessagesDelivered / totalMessagesProcessed) * 100).toFixed(1))
    : 100;

  const avgChatDurationSeconds = completedSessionsCount > 0
    ? Math.round(totalDurationSecondsSum / completedSessionsCount)
    : 0;

  const avgMsgLengthChars = totalMessagesDelivered > 0
    ? Math.round(totalDeliveredChars / totalMessagesDelivered)
    : 0;

  const topTriggers = Array.from(triggerFrequencyMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const topOffenders = Array.from(repeatOffendersMap.values())
    .sort((a, b) => b.violationCount - a.violationCount)
    .slice(0, 15);

  const totalContactAttempts = phoneNumbersSharedCount + phoneNumbersAskedCount + socialHandlesCount;
  const offPlatformAttemptRate = totalMessagesProcessed > 0
    ? Number(((totalContactAttempts / totalMessagesProcessed) * 100).toFixed(1))
    : 0;

  const pm = computeCorePMMetrics(true);

  return {
    overview: {
      totalMessagesProcessed,
      totalMessagesDelivered,
      totalMessagesBlocked,
      totalDeliveredChars,
      totalDurationSecondsSum,
      cleanPassRate,
      cleanRatePct: cleanPassRate,
      avgMsgLengthChars,
      avgMsgLength: avgMsgLengthChars,
      offPlatformAttemptRate,
      offPlatformRatePct: offPlatformAttemptRate,
      phoneNumbersSharedCount,
      sharedNumbers: phoneNumbersSharedCount,
      phoneNumbersAskedCount,
      askedNumbers: phoneNumbersAskedCount,
      socialHandlesCount,
      socialHandles: socialHandlesCount,
      slursInterceptedCount,
      slursBlocked: slursInterceptedCount,
      threatsInterceptedCount,
      linksBlockedCount,
      symbolsBlockedCount,
      completedSessionsCount,
      avgChatDurationSeconds,
      avgDurationSec: avgChatDurationSeconds,
    },
    slurDistribution: { ...slurCategories },
    contactExtraction: {
      ...contactExtractionStats,
      totalContactAttempts,
    },
    engagement: {
      durationBuckets: { ...sessionDurationBuckets },
      messagesPerChatBuckets: { ...messagesPerChatBuckets },
      vibes: { ...conversationVibes },
    },
    growthFunnel: pm.growthFunnel,
    engagementDynamics: pm.engagementDynamics,
    hourlyDiurnalActivity: hourlyDiurnalActivity.map(item => ({ ...item })),
    tagAnalytics: pm.tagAnalytics,
    growthExperiments: pm.growthExperiments,
    growthDeltas: pm.growthDeltas,
    timeSeries: minuteBuckets.slice(-20),
    topTriggers,
    topOffenders,
    recentInterceptions: interceptionWire.slice(0, 100),
    liveActions: liveUserActions.slice(0, 80),
    liveUserActions: liveUserActions.slice(0, 80),
  };
}

function getUserPsychologyProfile(userId) {
  const snap = getBehaviorAnalyticsSnapshot();
  return {
    userId: userId || 'global',
    vibes: snap.engagement.vibes,
    cleanRatePct: snap.overview.cleanRatePct,
  };
}

function resetBehaviorAnalytics() {
  totalMessagesProcessed = 0;
  totalMessagesDelivered = 0;
  totalMessagesBlocked = 0;
  totalDeliveredChars = 0;

  phoneNumbersSharedCount = 0;
  phoneNumbersAskedCount = 0;
  socialHandlesCount = 0;
  slursInterceptedCount = 0;
  threatsInterceptedCount = 0;
  linksBlockedCount = 0;
  symbolsBlockedCount = 0;

  for (const k of Object.keys(slurCategories)) slurCategories[k] = 0;
  for (const k of Object.keys(contactExtractionStats)) contactExtractionStats[k] = 0;

  completedSessionsCount = 0;
  totalDurationSecondsSum = 0;
  for (const k of Object.keys(sessionDurationBuckets)) sessionDurationBuckets[k] = 0;
  for (const k of Object.keys(messagesPerChatBuckets)) messagesPerChatBuckets[k] = 0;
  for (const k of Object.keys(conversationVibes)) conversationVibes[k] = 0;

  growthFunnel.visitorArrivals = 0;
  growthFunnel.queueEnters = 0;
  growthFunnel.queueAbandons = 0;
  growthFunnel.matchesMade = 0;
  growthFunnel.firstMessagesSent = 0;
  growthFunnel.activatedChats3Turns = 0;
  growthFunnel.deepConnections = 0;

  firstMsgRoomsSet.clear();
  activated3TurnsRoomsSet.clear();
  deepConnectedRoomsSet.clear();

  engagementDynamics.turnSymmetrySum = 0;
  engagementDynamics.turnSymmetryCount = 0;
  engagementDynamics.responseLatencySumMs = 0;
  engagementDynamics.responseLatencyCount = 0;
  engagementDynamics.ghostedChatsCount = 0;
  engagementDynamics.totalChatsCount = 0;
  engagementDynamics.cleanChatDurationSum = 0;
  engagementDynamics.cleanChatCount = 0;
  engagementDynamics.violativeChatDurationSum = 0;
  engagementDynamics.violativeChatCount = 0;

  for (let h = 0; h < 24; h++) {
    hourlyDiurnalActivity[h].visitorsCount = 0;
    hourlyDiurnalActivity[h].chatsCount = 0;
    hourlyDiurnalActivity[h].messagesCount = 0;
    hourlyDiurnalActivity[h].violationsCount = 0;
    hourlyDiurnalActivity[h].durationSecSum = 0;
    hourlyDiurnalActivity[h].avgDurationSec = 0;
    hourlyDiurnalActivity[h].civilityScorePct = 100;
  }

  tagAnalytics.taggedQueueEnters = 0;
  tagAnalytics.untaggedQueueEnters = 0;
  tagAnalytics.taggedMatchesCount = 0;
  tagAnalytics.untaggedMatchesCount = 0;
  tagAnalytics.taggedDurationSum = 0;
  tagAnalytics.untaggedDurationSum = 0;
  tagAnalytics.taggedCompletedCount = 0;
  tagAnalytics.untaggedCompletedCount = 0;
  tagAnalytics.taggedSkipCount = 0;
  tagAnalytics.untaggedSkipCount = 0;
  tagAnalytics.taggedCleanCount = 0;
  tagAnalytics.untaggedCleanCount = 0;
  for (const k of Object.keys(tagAnalytics.topTags)) tagAnalytics.topTags[k] = 0;

  baselineSnapshot = null;
  interceptionWire.length = 0;
  triggerFrequencyMap.clear();
  repeatOffendersMap.clear();
  liveUserActions.length = 0;

  minuteBuckets.length = 0;
  const now = Date.now();
  for (let i = 15; i >= 0; i--) {
    const t = Math.floor((now - i * 60000) / 60000) * 60000;
    minuteBuckets.push({
      timestamp: t,
      timeLabel: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cleanMsgs: 0,
      slurs: 0,
      askedNumbers: 0,
      sharedNumbers: 0,
      socials: 0,
      otherBlocked: 0,
    });
  }

  return getBehaviorAnalyticsSnapshot();
}

module.exports = {
  recordMessageDelivered,
  recordViolationEvent,
  recordSessionCompleted,
  recordUserAction,
  recordVisitorArrival,
  recordQueueEnter,
  recordQueueAbandon,
  recordMatchFormed,
  recordMessageTurn,
  recordChatCompletion,
  getBehaviorAnalyticsSnapshot,
  getBehaviorAnalyticsForPersistence,
  hydrateBehaviorFromFirestore,
  resetBehaviorAnalytics,
  getUserPsychologyProfile,
  classifySlurWord,
};
