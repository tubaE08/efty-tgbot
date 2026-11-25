import fs from 'fs';
import path from 'path';
import { SmmApi } from '../lib/smmApi.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SMM_API_KEY = process.env.SMM_API_KEY || '';
const SMM_API_URL = process.env.SMM_API_URL || 'https://minismm.com/api/v2';

// Fixed Configuration
const ADMIN_CHAT_ID = Number(process.env.ADMIN_ID || '1806670882');
const ADMIN_USERNAME = '@Efty67';
const BKASH_NUMBER = '01985060380';
const BDT_MULTIPLIER = 100; // API রেট (যেমন 0.12 -> 12 টাকা)
const EXTRA_PROFIT = 10; // প্রতিটি রেটের সাথে +10 টাকা যোগ
const REFERRAL_BONUS = 2.00; // প্রতি সফল রেফারে ২ টাকা বোনাস

const smm = new SmmApi(SMM_API_KEY, SMM_API_URL);

const DB_FILE = path.join('/tmp', 'efty_tg_bot_db.json');
let memoryStore = null;
let cachedBotUsername = '';

function getDb() {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(DB_FILE)) {
      memoryStore = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return memoryStore;
    }
  } catch {}
  memoryStore = { users: {}, payments: [], orders: [], states: {} };
  return memoryStore;
}

function saveDb(db) {
  memoryStore = db;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch {}
}

function ensureUser(db, tgUser) {
  const id = String(tgUser.id);
  if (!db.users[id]) {
    db.users[id] = {
      id: Number(tgUser.id),
      name: tgUser.first_name || 'User',
      username: tgUser.username || '',
      balance: 0,
      ordersCount: 0,
      totalDeposit: 0,
      referralsCount: 0,
      referredBy: null,
    };
    saveDb(db);
  } else {
    if (db.users[id].referralsCount === undefined) db.users[id].referralsCount = 0;
    if (db.users[id].referredBy === undefined) db.users[id].referredBy = null;
  }
  return db.users[id];
}

async function tg(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function getBotUsername() {
  if (cachedBotUsername) return cachedBotUsername;
  if (process.env.BOT_USERNAME) {
    cachedBotUsername = process.env.BOT_USERNAME.replace(/^@/, '');
    return cachedBotUsername;
  }
  try {
    const me = await tg('getMe');
    if (me?.ok && me.result?.username) {
      cachedBotUsername = me.result.username;
      return cachedBotUsername;
    }
  } catch {}
  return 'YourBotUsername';
}

function sendMsg(chatId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return tg('sendMessage', body);
}

function mainKeyboard(isAdmin = false) {
  const rows = [
    [
      { text: '🛍 অর্ডার করুন', callback_data: 'menu_order' },
      { text: '💳 ব্যালেন্স অ্যাড (bKash)', callback_data: 'menu_deposit' },
    ],
    [
      { text: '📋 সার্ভিস লিস্ট', callback_data: 'menu_services' },
      { text: '📜 ইতিহাস / অর্ডার', callback_data: 'menu_history' },
    ],
    [
      { text: '👥 রেফার করুন', callback_data: 'menu_refer' },
      { text: '🔍 অর্ডার স্ট্যাটাস', callback_data: 'menu_status' },
    ],
    [
      { text: '📞 সাপোর্ট (@Efty67)', url: 'https://t.me/Efty67' },
    ],
  ];

  if (isAdmin) {
    rows.push([{ text: '🛠 অ্যাডমিন প্যানেল', callback_data: 'menu_admin' }]);
  }

  return { inline_keyboard: rows };
}

// API রেট (যেমন 0.12) -> 12 টাকা BDT + 10 টাকা লাভ = 22 টাকা
function getServiceRateBdt(apiRate) {
  const baseBdt = Number(apiRate || 0) * BDT_MULTIPLIER;
  return Number((baseBdt + EXTRA_PROFIT).toFixed(2));
}

function calcUserPrice(apiRate, qty = 1000, isPackage = false) {
  const ratePer1k = getServiceRateBdt(apiRate);
  if (isPackage) return ratePer1k;
  return Number(((ratePer1k / 1000) * Number(qty)).toFixed(2));
}

async function sendHomeMenu(chatId, tgUser, db) {
  const user = ensureUser(db, tgUser);
  const isAdmin = Number(tgUser.id) === ADMIN_CHAT_ID;

  const text =
    `✨ <b>স্বাগতম Efty Smm Panel BD 🇧🇩</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `⚡ <b>সবচেয়ে কম দামে সব সার্ভিস!</b>\n` +
    `🎁 <b>প্রতি রেফারে বোনাস:</b> <b>${REFERRAL_BONUS.toFixed(2)} টাকা</b>\n` +
    `💳 <b>bKash Deposit:</b> <code>${BKASH_NUMBER}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>নাম:</b> ${user.name}\n` +
    `🆔 <b>আপনার User ID:</b> <code>${user.id}</code>\n` +
    `💰 <b>বর্তমান ব্যালেন্স:</b> <b>${Number(user.balance).toFixed(2)} টাকা</b>\n` +
    `👥 <b>মোট রেফার:</b> ${user.referralsCount || 0} জন\n` +
    `📦 <b>মোট অর্ডার:</b> ${user.ordersCount} টি\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `নিচের বাটন থেকে আপনার প্রয়োজনীয় কাজ শুরু করুন:`;

  return sendMsg(chatId, text, mainKeyboard(isAdmin));
}

async function sendAdminMenu(chatId, db) {
  const apiBal = await smm.balance().catch(() => null);
  const pendingPays = db.payments.filter((p) => p.status === 'pending');

  return sendMsg(
    chatId,
    `🛠 <b>Admin Dashboard (@Efty67)</b>\n\n` +
      `📡 <b>MiniSMM API Balance:</b> <b>${apiBal?.balance ?? 'N/A'} ${apiBal?.currency || ''}</b>\n` +
      `👥 <b>মোট ইউজার:</b> ${Object.keys(db.users).length} জন\n` +
      `⏳ <b>Pending bKash:</b> ${pendingPays.length} টি\n` +
      `📦 <b>মোট অর্ডার:</b> ${db.orders.length} টি\n\n` +
      `<b>দ্রুত ব্যালেন্স অ্যাড কমান্ড:</b>\n` +
      `<code>/addbalance USER_ID AMOUNT</code>\n` +
      `উদাহরণ: <code>/addbalance 1806670882 100</code>`,
    {
      inline_keyboard: [
        [{ text: '➕ ইউজার ব্যালেন্স অ্যাড করুন', callback_data: 'admin_add_bal_prompt' }],
        [{ text: '🔙 হোম মেনু', callback_data: 'home' }],
      ],
    }
  );
}

async function sendReferralInfo(chatId, tgUser, db) {
  const user = ensureUser(db, tgUser);
  const botUsername = await getBotUsername();
  const refLink = `https://t.me/${botUsername}?start=ref_${user.id}`;
  const refCount = Number(user.referralsCount || 0);
  const totalRefEarned = (refCount * REFERRAL_BONUS).toFixed(2);

  const text =
    `👥 <b>রেফার করে আয় করুন!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>প্রতি রেফারে বোনাস:</b> <b>${REFERRAL_BONUS.toFixed(2)} টাকা</b>\n` +
    `👤 <b>আপনার মোট রেফার:</b> <b>${refCount} জন</b>\n` +
    `💰 <b>রেফার থেকে মোট আয়:</b> <b>${totalRefEarned} টাকা</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 <b>আপনার রেফার লিংক:</b>\n` +
    `<code>${refLink}</code>\n\n` +
    `লিংকটি বন্ধুদের সাথে শেয়ার করুন। নতুন কেউ আপনার লিংক দিয়ে বটে যুক্ত হলেই আপনার ব্যালেন্সে <b>২.০০ টাকা</b> যোগ হয়ে যাবে!`;

  return sendMsg(chatId, text, {
    inline_keyboard: [[{ text: '🔙 হোম মেনু', callback_data: 'home' }]],
  });
}

async function sendOrderConfirmation(chatId, from, user, draft, isAdmin) {
  const ratePer1k = getServiceRateBdt(draft.apiRate);
  const totalCost = calcUserPrice(draft.apiRate, draft.quantity, draft.isPackage);
  const balAfter = Number(user.balance) - totalCost;

  const summaryText =
    `🧾 <b>অর্ডার সামারি (মোট খরচ)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>সার্ভিস:</b> ${draft.serviceName} (ID: <code>${draft.serviceId}</code>)\n` +
    `🔗 <b>লিংক:</b> <code>${draft.link}</code>\n` +
    `🔢 <b>পরিমাণ:</b> <b>${draft.isPackage ? 'Package (1)' : draft.quantity}</b>\n` +
    `💵 <b>রেট (প্রতি 1000):</b> <b>${ratePer1k.toFixed(2)} টাকা</b>\n` +
    `💰 <b>মোট খরচ:</b> <b>${totalCost.toFixed(2)} টাকা</b>\n` +
    `💳 <b>আপনার বর্তমান ব্যালেন্স:</b> <b>${Number(user.balance).toFixed(2)} টাকা</b>\n` +
    `📉 <b>অর্ডারের পর ব্যালেন্স থাকবে:</b> <b>${balAfter >= 0 ? balAfter.toFixed(2) : 'অপর্যাপ্ত'} টাকা</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `অর্ডারটি কি কনফার্ম করবেন?`;

  if (Number(user.balance) < totalCost) {
    await sendMsg(
      chatId,
      `${summaryText}\n\n❌ <b>আপনার ব্যালেন্স অপর্যাপ্ত!</b> আগে bKash (<code>${BKASH_NUMBER}</code>) দিয়ে ব্যালেন্স অ্যাড করুন।`,
      mainKeyboard(isAdmin)
    );
    return;
  }

  await sendMsg(chatId, summaryText, {
    inline_keyboard: [
      [
        { text: '✅ Confirm Order', callback_data: 'confirm_order_yes' },
        { text: '❌ Cancel', callback_data: 'confirm_order_no' },
      ],
    ],
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, bot: 'Efty Smm Panel Bot Active' });
  }

  if (!BOT_TOKEN) {
    return res.status(200).json({ ok: false, error: 'BOT_TOKEN missing in environment' });
  }

  try {
    const update = req.body || {};
    const db = getDb();

    // ১. বাটন ক্লিক (Callback Query)
    if (update.callback_query) {
      const cb = update.callback_query;
      const from = cb.from;
      const chatId = cb.message?.chat?.id || from.id;
      const data = cb.data || '';
      const isAdmin = Number(from.id) === ADMIN_CHAT_ID;
      const user = ensureUser(db, from);

      await tg('answerCallbackQuery', { callback_query_id: cb.id });

      if (data === 'home') {
        delete db.states[String(from.id)];
        saveDb(db);
        await sendHomeMenu(chatId, from, db);
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_refer') {
        await sendReferralInfo(chatId, from, db);
        return res.status(200).json({ ok: true });
      }

      if (data === 'confirm_order_no') {
        delete db.states[String(from.id)];
        saveDb(db);
        await sendMsg(chatId, '❌ অর্ডারটি বাতিল করা হয়েছে।', mainKeyboard(isAdmin));
        return res.status(200).json({ ok: true });
      }

      if (data === 'confirm_order_yes') {
        const state = db.states[String(from.id)];
        if (!state || state.step !== 'order_confirm') {
          await sendMsg(chatId, '⚠️ কোনো পেন্ডিং অর্ডার সামারি পাওয়া যায়নি। আবার অর্ডার শুরু করুন।', mainKeyboard(isAdmin));
          return res.status(200).json({ ok: true });
        }

        const charge = calcUserPrice(state.apiRate, state.quantity, state.isPackage);
        if (Number(user.balance) < charge) {
          delete db.states[String(from.id)];
          saveDb(db);
          await sendMsg(
            chatId,
            `❌ <b>অপর্যাপ্ত ব্যালেন্স!</b>\nমোট খরচ: <b>${charge.toFixed(2)} টাকা</b>, আপনার ব্যালেন্স: <b>${Number(user.balance).toFixed(2)} টাকা</b>`,
            mainKeyboard(isAdmin)
          );
          return res.status(200).json({ ok: true });
        }

        const payload = {
          service: state.serviceId,
          link: state.link,
        };
        if (!state.isPackage) {
          payload.quantity = state.quantity;
        }

        const apiRes = await smm.order(payload);
        delete db.states[String(from.id)];

        if (!apiRes || !apiRes.order) {
          saveDb(db);
          await sendMsg(
            chatId,
            `❌ <b>অর্ডার সাবমিট হয়নি!</b>\nকারণ: ${apiRes?.error || 'API Error'}\nআপনার ব্যালেন্স কাটা হয়নি।`,
            mainKeyboard(isAdmin)
          );
          return res.status(200).json({ ok: true });
        }

        user.balance = Number((Number(user.balance) - charge).toFixed(2));
        user.ordersCount += 1;
        db.orders.push({
          id: db.orders.length + 1,
          userId: Number(from.id),
          smmOrderId: apiRes.order,
          serviceId: state.serviceId,
          link: state.link,
          quantity: state.isPackage ? 1 : state.quantity,
          charge,
        });
        saveDb(db);

        await sendMsg(
          chatId,
          `🎉 <b>অর্ডার সফলভাবে সম্পন্ন হয়েছে!</b>\n` +
            `🆔 <b>Order ID:</b> <code>${apiRes.order}</code>\n` +
            `📦 <b>সার্ভিস:</b> ${state.serviceName}\n` +
            `🔢 <b>পরিমাণ:</b> <b>${state.isPackage ? 'Package (1)' : state.quantity}</b>\n` +
            `💰 <b>মোট খরচ:</b> <b>${charge.toFixed(2)} টাকা</b>\n` +
            `💳 <b>অবশিষ্ট ব্যালেন্স:</b> <b>${user.balance.toFixed(2)} টাকা</b>`,
          mainKeyboard(isAdmin)
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_deposit') {
        db.states[String(from.id)] = { step: 'deposit_amount' };
        saveDb(db);
        await sendMsg(
          chatId,
          `💳 <b>bKash ব্যালেন্স অ্যাড</b>\n\n` +
            `প্রথমে নিচের bKash পার্সোনাল নম্বরে <b>Send Money</b> করুন:\n` +
            `📱 <b>bKash Number:</b> <code>${BKASH_NUMBER}</code>\n\n` +
            `টাকা পাঠানোর পর এখন আপনি <b>কত টাকা</b> পাঠিয়েছেন তা লিখুন (যেমন: <code>100</code>):`,
          { inline_keyboard: [[{ text: '🔙 ফিরে যান', callback_data: 'home' }]] }
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_services') {
        const services = await smm.services();
        if (!Array.isArray(services)) {
          await sendMsg(chatId, '❌ সার্ভিস লোড করা যায়নি, একটু পর আবার চেষ্টা করুন।');
          return res.status(200).json({ ok: true });
        }

        const sample = services.slice(0, 15).map((s) => {
          const userRate1k = getServiceRateBdt(s.rate).toFixed(2);
          return `🔹 ID: <code>${s.service}</code> — <b>${s.name}</b>\n   💵 রেট (প্রতি 1000): <b>${userRate1k} টাকা</b> | Min: ${s.min} | Max: ${s.max}`;
        });

        await sendMsg(
          chatId,
          `📋 <b>সবচেয়ে কম দামে সার্ভিস লিস্ট (১-১৫):</b>\n\n${sample.join('\n\n')}\n\n` +
            `🔎 নির্দিষ্ট সার্ভিস খুঁজতে লিখুন: <code>/search instagram</code> বা <code>/search tiktok</code>`,
          {
            inline_keyboard: [
              [{ text: '🛍 এখনই অর্ডার করুন', callback_data: 'menu_order' }],
              [{ text: '🔙 হোম মেনু', callback_data: 'home' }],
            ],
          }
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_order') {
        db.states[String(from.id)] = { step: 'order_service_id' };
        saveDb(db);
        await sendMsg(
          chatId,
          `🛍 <b>নতুন অর্ডার করুন</b>\n\n` +
            `আপনার বর্তমান ব্যালেন্স: <b>${Number(user.balance).toFixed(2)} টাকা</b>\n\n` +
            `আপনি যে সার্ভিসটি নিতে চান তার <b>Service ID</b> দিন (যেমন: <code>2994</code>):`,
          { inline_keyboard: [[{ text: '🔙 বাতিল করুন', callback_data: 'home' }]] }
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_history') {
        const myOrders = db.orders.filter((o) => Number(o.userId) === Number(from.id)).slice(-10).reverse();
        const myPays = db.payments.filter((p) => Number(p.userId) === Number(from.id)).slice(-5).reverse();

        const ordText = myOrders.length
          ? myOrders.map((o) => `• Order #<code>${o.smmOrderId}</code> | Service: ${o.serviceId} | Qty: ${o.quantity} | চার্জ: <b>${Number(o.charge).toFixed(2)}৳</b>`).join('\n')
          : 'কোনো অর্ডার পাওয়া যায়নি।';

        const payText = myPays.length
          ? myPays.map((p) => `• TrxID: <code>${p.trxId}</code> | <b>${p.amount}৳</b> | স্ট্যাটাস: <b>${p.status}</b>`).join('\n')
          : 'কোনো ডিপোজিট হিস্টোরি নেই।';

        await sendMsg(
          chatId,
          `📜 <b>আপনার সাম্প্রতিক ইতিহাস</b>\n\n` +
            `<b>📦 শেষ ১০টি অর্ডার:</b>\n${ordText}\n\n` +
            `<b>💳 শেষ ৫টি bKash ডিপোজিট:</b>\n${payText}`,
          { inline_keyboard: [[{ text: '🔙 হোম মেনু', callback_data: 'home' }]] }
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_status') {
        db.states[String(from.id)] = { step: 'check_status_id' };
        saveDb(db);
        await sendMsg(
          chatId,
          `🔍 <b>অর্ডার স্ট্যাটাস চেক</b>\n\nআপনার <b>Order ID</b> নম্বরটি লিখে পাঠান:`,
          { inline_keyboard: [[{ text: '🔙 ফিরে যান', callback_data: 'home' }]] }
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_admin') {
        if (!isAdmin) return res.status(200).json({ ok: true });
        await sendAdminMenu(chatId, db);
        return res.status(200).json({ ok: true });
      }

      if (data === 'admin_add_bal_prompt') {
        if (!isAdmin) return res.status(200).json({ ok: true });
        db.states[String(from.id)] = { step: 'admin_add_bal_input' };
        saveDb(db);
        await sendMsg(
          chatId,
          `➕ <b>ইউজার ব্যালেন্স অ্যাড</b>\n\nইউজারের <b>User ID</b> এবং <b>টাকার পরিমাণ</b> স্পেস দিয়ে লিখুন:\nউদাহরণ: <code>123456789 200</code>`,
          { inline_keyboard: [[{ text: '🔙 বাতিল', callback_data: 'home' }]] }
        );
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('pay_ok_') || data.startsWith('pay_no_')) {
        if (!isAdmin) {
          await sendMsg(chatId, '⛔ শুধুমাত্র অ্যাডমিন এই বাটন ব্যবহার করতে পারবেন।');
          return res.status(200).json({ ok: true });
        }

        const isApprove = data.startsWith('pay_ok_');
        const payId = Number(data.replace('pay_ok_', '').replace('pay_no_', ''));
        const payItem = db.payments.find((p) => p.id === payId);

        if (!payItem) {
          await sendMsg(chatId, '❌ পেমেন্ট রিকোয়েস্টটি পাওয়া যায়নি।');
          return res.status(200).json({ ok: true });
        }
        if (payItem.status !== 'pending') {
          await sendMsg(chatId, `⚠️ এটি ইতিমধ্যে <b>${payItem.status}</b> করা হয়েছে।`);
          return res.status(200).json({ ok: true });
        }

        if (isApprove) {
          payItem.status = 'approved';
          const targetUser = db.users[String(payItem.userId)];
          if (targetUser) {
            targetUser.balance = Number((Number(targetUser.balance) + Number(payItem.amount)).toFixed(2));
            targetUser.totalDeposit = Number((Number(targetUser.totalDeposit || 0) + Number(payItem.amount)).toFixed(2));
          }
          saveDb(db);

          await sendMsg(
            chatId,
            `✅ <b>bKash পেমেন্ট Approved!</b>\nUser ID: <code>${payItem.userId}</code>\nTrxID: <code>${payItem.trxId}</code>\nযোগ হয়েছে: <b>${payItem.amount} টাকা</b>`
          );

          await sendMsg(
            payItem.userId,
            `🎉 <b>আপনার bKash পেমেন্ট সফলভাবে অ্যাপ্রুভ হয়েছে!</b>\n` +
              `🧾 TrxID: <code>${payItem.trxId}</code>\n` +
              `💰 যোগ হয়েছে: <b>${payItem.amount} টাকা</b>\n` +
              `💳 বর্তমান ব্যালেন্স: <b>${Number(targetUser?.balance || 0).toFixed(2)} টাকা</b>`,
            mainKeyboard(Number(payItem.userId) === ADMIN_CHAT_ID)
          );
        } else {
          payItem.status = 'rejected';
          saveDb(db);

          await sendMsg(chatId, `❌ TrxID <code>${payItem.trxId}</code> রিজেক্ট করা হয়েছে।`);
          await sendMsg(
            payItem.userId,
            `❌ <b>আপনার bKash পেমেন্ট রিকোয়েস্ট রিজেক্ট হয়েছে।</b>\nTrxID: <code>${payItem.trxId}</code>\nসঠিক তথ্য দিয়ে আবার চেষ্টা করুন বা সাপোর্টে যোগাযোগ করুন: ${ADMIN_USERNAME}`
          );
        }

        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    // ২. টেক্সট মেসেজ হ্যান্ডলিং
    const msg = update.message;
    if (!msg || !msg.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = msg.chat.id;
    const from = msg.from;
    const text = msg.text.trim();
    const isAdmin = Number(from.id) === ADMIN_CHAT_ID;

    const existingUser = db.users[String(from.id)];
    const isNewUser = !existingUser;
    const user = ensureUser(db, from);

    if (text === '/admin' || text.startsWith('/admin@')) {
      delete db.states[String(from.id)];
      saveDb(db);
      if (!isAdmin) {
        await sendMsg(chatId, '⛔ শুধুমাত্র অ্যাডমিন এই কমান্ড ব্যবহার করতে পারবেন।', mainKeyboard(false));
        return res.status(200).json({ ok: true });
      }
      await sendAdminMenu(chatId, db);
      return res.status(200).json({ ok: true });
    }

    if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start@') || text === '/menu' || text.startsWith('/menu@')) {
      delete db.states[String(from.id)];

      const startPayload = text.startsWith('/start ') ? text.slice(7).trim() : '';
      if (startPayload.startsWith('ref_')) {
        const referrerId = String(startPayload.replace('ref_', '').trim());
        if (
          isNewUser &&
          !user.referredBy &&
          referrerId &&
          referrerId !== String(from.id) &&
          db.users[referrerId]
        ) {
          user.referredBy = referrerId;
          db.users[referrerId].balance = Number(
            (Number(db.users[referrerId].balance || 0) + REFERRAL_BONUS).toFixed(2)
          );
          db.users[referrerId].referralsCount = Number(db.users[referrerId].referralsCount || 0) + 1;
          saveDb(db);

          await sendMsg(
            Number(referrerId),
            `🎉 <b>নতুন রেফার বোনাস!</b>\n` +
              `আপনার লিংক থেকে <b>${user.name}</b> বটে যুক্ত হয়েছেন।\n` +
              `💰 আপনার ব্যালেন্সে <b>+${REFERRAL_BONUS.toFixed(2)} টাকা</b> যোগ হয়েছে!\n` +
              `💳 বর্তমান ব্যালেন্স: <b>${Number(db.users[referrerId].balance).toFixed(2)} টাকা</b>`
          ).catch(() => {});
        }
      }

      saveDb(db);
      await sendHomeMenu(chatId, from, db);
      return res.status(200).json({ ok: true });
    }

    if (text.toLowerCase().startsWith('/search')) {
      const kw = text.slice(7).trim().toLowerCase();
      if (!kw) {
        await sendMsg(chatId, '🔎 লিখুন: <code>/search instagram</code> বা <code>/search tiktok</code>');
        return res.status(200).json({ ok: true });
      }
      const services = await smm.services();
      const matched = Array.isArray(services)
        ? services.filter((s) => String(s.service).includes(kw) || String(s.name || '').toLowerCase().includes(kw)).slice(0, 15)
        : [];

      if (!matched.length) {
        await sendMsg(chatId, `❌ "${kw}" নামে কোনো সার্ভিস পাওয়া যায়নি।`);
        return res.status(200).json({ ok: true });
      }

      const listText = matched.map((s) => {
        const rate1k = getServiceRateBdt(s.rate).toFixed(2);
        return `🔹 ID: <code>${s.service}</code> — <b>${s.name}</b>\n   💵 রেট/1k: <b>${rate1k} টাকা</b> | Min: ${s.min} | Max: ${s.max}`;
      });

      await sendMsg(chatId, `🔎 <b>সার্চ রেজাল্ট:</b>\n\n${listText.join('\n\n')}`, {
        inline_keyboard: [[{ text: '🛍 অর্ডার করুন', callback_data: 'menu_order' }]],
      });
      return res.status(200).json({ ok: true });
    }

    if (text.toLowerCase().startsWith('/addbalance')) {
      if (!isAdmin) {
        await sendMsg(chatId, '⛔ শুধুমাত্র অ্যাডমিন এই কমান্ড ব্যবহার করতে পারবেন।');
        return res.status(200).json({ ok: true });
      }
      const parts = text.split(/\s+/);
      const targetId = String(parts[1] || '');
      const amount = Number(parts[2]);

      if (!targetId || Number.isNaN(amount) || amount === 0) {
        await sendMsg(chatId, '⚠️ সঠিক নিয়ম: <code>/addbalance 123456789 100</code>');
        return res.status(200).json({ ok: true });
      }

      if (!db.users[targetId]) {
        db.users[targetId] = {
          id: Number(targetId),
          name: 'User',
          username: '',
          balance: 0,
          ordersCount: 0,
          totalDeposit: 0,
          referralsCount: 0,
          referredBy: null,
        };
      }

      db.users[targetId].balance = Number((Number(db.users[targetId].balance) + amount).toFixed(2));
      saveDb(db);

      await sendMsg(
        chatId,
        `✅ ব্যালেন্স আপডেট সফল!\n🆔 User ID: <code>${targetId}</code>\n💰 বর্তমান ব্যালেন্স: <b>${db.users[targetId].balance.toFixed(2)} টাকা</b>`
      );
      await sendMsg(
        Number(targetId),
        `💰 অ্যাডমিন আপনার অ্যাকাউন্টে <b>${amount > 0 ? '+' : ''}${amount} টাকা</b> ব্যালেন্স যোগ করেছেন!\n💳 বর্তমান ব্যালেন্স: <b>${db.users[targetId].balance.toFixed(2)} টাকা</b>`
      ).catch(() => {});

      return res.status(200).json({ ok: true });
    }

    const state = db.states[String(from.id)];
    if (state) {
      if (state.step === 'admin_add_bal_input' && isAdmin) {
        const parts = text.split(/\s+/);
        const targetId = String(parts[0] || '');
        const amount = Number(parts[1]);

        if (!targetId || Number.isNaN(amount) || amount === 0) {
          await sendMsg(chatId, '⚠️ সঠিক ফরম্যাটে লিখুন: <code>123456789 100</code>');
          return res.status(200).json({ ok: true });
        }

        if (!db.users[targetId]) {
          db.users[targetId] = {
            id: Number(targetId),
            name: 'User',
            username: '',
            balance: 0,
            ordersCount: 0,
            totalDeposit: 0,
            referralsCount: 0,
            referredBy: null,
          };
        }
        db.users[targetId].balance = Number((Number(db.users[targetId].balance) + amount).toFixed(2));
        delete db.states[String(from.id)];
        saveDb(db);

        await sendMsg(chatId, `✅ User <code>${targetId}</code>-এর নতুন ব্যালেন্স: <b>${db.users[targetId].balance.toFixed(2)} টাকা</b>`, mainKeyboard(true));
        await sendMsg(Number(targetId), `💰 আপনার অ্যাকাউন্টে <b>${amount} টাকা</b> ব্যালেন্স যোগ হয়েছে! বর্তমান ব্যালেন্স: <b>${db.users[targetId].balance.toFixed(2)} টাকা</b>`).catch(() => {});
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'deposit_amount') {
        const amt = Number(text);
        if (!amt || amt <= 0) {
          await sendMsg(chatId, '⚠️ সঠিক টাকার পরিমাণ লিখুন (যেমন: <code>100</code>):');
          return res.status(200).json({ ok: true });
        }
        db.states[String(from.id)] = { step: 'deposit_trxid', amount: amt };
        saveDb(db);
        await sendMsg(
          chatId,
          `✅ পরিমাণ: <b>${amt} টাকা</b>\n\nএখন আপনার bKash <b>Transaction ID (TrxID)</b> টি লিখে পাঠান (যেমন: <code>8N7F6D5S4A</code>):`
        );
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'deposit_trxid') {
        const trxId = text.toUpperCase();
        if (trxId.length < 5) {
          await sendMsg(chatId, '⚠️ সঠিক bKash Transaction ID দিন:');
          return res.status(200).json({ ok: true });
        }
        if (db.payments.some((p) => p.trxId === trxId)) {
          await sendMsg(chatId, '❌ এই TrxID ইতিমধ্যে ব্যবহার করা হয়েছে! নতুন TrxID দিন:');
          return res.status(200).json({ ok: true });
        }

        const payRecord = {
          id: db.payments.length + 1,
          userId: Number(from.id),
          userName: user.name,
          amount: state.amount,
          trxId,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        db.payments.push(payRecord);
        delete db.states[String(from.id)];
        saveDb(db);

        await sendMsg(
          chatId,
          `⏳ <b>আপনার bKash পেমেন্ট রিকোয়েস্ট জমা হয়েছে!</b>\n` +
            `📱 bKash নম্বর: <code>${BKASH_NUMBER}</code>\n` +
            `💰 পরিমাণ: <b>${payRecord.amount} টাকা</b>\n` +
            `🧾 TrxID: <code>${payRecord.trxId}</code>\n\n` +
            `অ্যাডমিন যাচাই করে Approve করলেই ব্যালেন্স যুক্ত হয়ে যাবে। প্রয়োজনে: ${ADMIN_USERNAME}`,
          mainKeyboard(isAdmin)
        );

        await sendMsg(
          ADMIN_CHAT_ID,
          `🔔 <b>নতুন bKash পেমেন্ট রিকোয়েস্ট!</b>\n\n` +
            `👤 User: ${user.name} (<code>${user.id}</code>)\n` +
            `💰 Amount: <b>${payRecord.amount} টাকা</b>\n` +
            `🧾 TrxID: <code>${payRecord.trxId}</code>`,
          {
            inline_keyboard: [
              [
                { text: '✅ Approve', callback_data: `pay_ok_${payRecord.id}` },
                { text: '❌ Reject', callback_data: `pay_no_${payRecord.id}` },
              ],
            ],
          }
        );

        return res.status(200).json({ ok: true });
      }

      if (state.step === 'order_service_id') {
        const serviceId = Number(text);
        if (!serviceId) {
          await sendMsg(chatId, '⚠️ সঠিক Service ID নম্বর দিন (যেমন: <code>2994</code>):');
          return res.status(200).json({ ok: true });
        }

        const services = await smm.services();
        const srv = Array.isArray(services) ? services.find((s) => Number(s.service) === serviceId) : null;
        if (!srv) {
          await sendMsg(chatId, `❌ Service ID <code>${serviceId}</code> পাওয়া যায়নি। আবার সঠিক ID দিন:`);
          return res.status(200).json({ ok: true });
        }

        const userRate1k = getServiceRateBdt(srv.rate).toFixed(2);
        db.states[String(from.id)] = {
          step: 'order_link',
          serviceId,
          serviceName: srv.name,
          apiRate: Number(srv.rate || 0),
          min: Number(srv.min || 1),
          max: Number(srv.max || 100000),
          isPackage: srv.type === 'Package',
        };
        saveDb(db);

        await sendMsg(
          chatId,
          `✅ <b>সার্ভিস নির্বাচিত:</b> ${srv.name}\n` +
            `💵 রেট (প্রতি 1000): <b>${userRate1k} টাকা</b>\n` +
            `📊 Min: <b>${srv.min}</b> | Max: <b>${srv.max}</b>\n\n` +
            `এখন আপনার <b>Link / Username</b> পাঠান:`
        );
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'order_link') {
        if (text.length < 3) {
          await sendMsg(chatId, '⚠️ সঠিক Link বা Username দিন:');
          return res.status(200).json({ ok: true });
        }

        if (state.isPackage) {
          const draft = { ...state, step: 'order_confirm', link: text, quantity: 1 };
          db.states[String(from.id)] = draft;
          saveDb(db);
          await sendOrderConfirmation(chatId, from, user, draft, isAdmin);
          return res.status(200).json({ ok: true });
        }

        db.states[String(from.id)] = { ...state, step: 'order_qty', link: text };
        saveDb(db);

        await sendMsg(
          chatId,
          `🔗 লিংক সেভ হয়েছে।\nএখন <b>Quantity (পরিমাণ)</b> লিখুন (Min: <b>${state.min}</b> — Max: <b>${state.max}</b>):`
        );
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'order_qty') {
        const qty = Number(text);
        if (!qty || qty < state.min || qty > state.max) {
          await sendMsg(chatId, `⚠️ পরিমাণ অবশ্যই <b>${state.min}</b> থেকে <b>${state.max}</b>-এর মধ্যে হতে হবে। আবার লিখুন:`);
          return res.status(200).json({ ok: true });
        }

        const draft = { ...state, step: 'order_confirm', quantity: qty };
        db.states[String(from.id)] = draft;
        saveDb(db);
        await sendOrderConfirmation(chatId, from, user, draft, isAdmin);
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'check_status_id') {
        const orderId = Number(text);
        delete db.states[String(from.id)];
        saveDb(db);
        if (!orderId) {
          await sendMsg(chatId, '⚠️ সঠিক Order ID দিন।', mainKeyboard(isAdmin));
          return res.status(200).json({ ok: true });
        }
        const st = await smm.status(orderId);
        await sendMsg(
          chatId,
          `🔍 <b>অর্ডার স্ট্যাটাস (#${orderId}):</b>\n` +
            `📊 Status: <b>${st.status || 'Unknown'}</b>\n` +
            `▶️ Start Count: ${st.start_count ?? '-'}\n` +
            `⏳ Remains: ${st.remains ?? '-'}`,
          mainKeyboard(isAdmin)
        );
        return res.status(200).json({ ok: true });
      }
    }

    await sendHomeMenu(chatId, from, db);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}


