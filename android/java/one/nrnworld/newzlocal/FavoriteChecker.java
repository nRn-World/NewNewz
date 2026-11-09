package one.nrnworld.newzlocal;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class FavoriteChecker {
    public static final String PREFS = "newzlocal_prefs";
    public static final String KEY_PAYLOAD = "synced_payload";
    private static final String KEY_SEEN_MAP = "seen_map_json";
    private static final String KEY_SEEDED = "seeded_labels_json";
    private static final String DEFAULT_WORKER = "https://newzlocal-proxy.bynrnworld.workers.dev";
    private static final String APP_BASE = "https://nrnworld.one/NewzLocal/";
    public static final int JOB_ID = 4201;
    private static final int MAX_FAVS = 40;

    private static final Pattern ITEM_RE = Pattern.compile("<item\\b[^>]*>([\\s\\S]*?)</item>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE_RE = Pattern.compile("<title>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</title>", Pattern.CASE_INSENSITIVE);
    private static final Pattern DESC_RE = Pattern.compile("<description>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</description>", Pattern.CASE_INSENSITIVE);
    private static final Pattern LINK_RE = Pattern.compile("<link>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</link>", Pattern.CASE_INSENSITIVE);
    private static final Pattern FB_RE = Pattern.compile("<a[^>]+id=[\"']thread_title_(\\d+)[\"'][^>]+href=[\"']([^\"']+)[\"'][^>]*>([\\s\\S]*?)</a>", Pattern.CASE_INSENSITIVE);

    private FavoriteChecker() {}

    public static void savePayloadAndSchedule(final Context ctx, String payloadJson) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_PAYLOAD, payloadJson).apply();
        schedulePeriodicJob(ctx);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                pollNow(ctx.getApplicationContext(), true);
            }
        });
        t.setDaemon(true);
        t.start();
    }

    public static void schedulePeriodicJob(Context ctx) {
        try {
            JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY_PAYLOAD, "");
            boolean hasPlaces = false;
            if (raw != null && !raw.isEmpty()) {
                JSONObject obj = new JSONObject(raw);
                JSONArray places = obj.optJSONArray("places");
                hasPlaces = places != null && places.length() > 0;
            }
            if (!hasPlaces) {
                js.cancel(JOB_ID);
                return;
            }
            if (js.getPendingJob(JOB_ID) != null) return;

            ComponentName cn = new ComponentName(ctx, FavoriteNewsJobService.class);
            JobInfo info = new JobInfo.Builder(JOB_ID, cn)
                    .setPeriodic(15L * 60L * 1000L)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build();
            js.schedule(info);
        } catch (Exception ignored) {
        }
    }

    private static boolean inQuietHours(JSONObject quietMap, String cat) {
        if (quietMap == null || cat == null || cat.isEmpty()) return false;
        JSONObject q = quietMap.optJSONObject(cat);
        if (q == null || !q.optBoolean("on", false)) return false;
        String from = q.optString("from", "22:00");
        String to = q.optString("to", "07:00");
        try {
            String[] fp = from.split(":");
            String[] tp = to.split(":");
            int fMin = Integer.parseInt(fp[0]) * 60 + Integer.parseInt(fp[1]);
            int tMin = Integer.parseInt(tp[0]) * 60 + Integer.parseInt(tp[1]);
            Calendar cal = Calendar.getInstance();
            int nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
            return (fMin <= tMin) ? (nowMin >= fMin && nowMin < tMin) : (nowMin >= fMin || nowMin < tMin);
        } catch (Exception e) {
            return false;
        }
    }

    private static String normStr(String s) {
        if (s == null) return "";
        String lower = s.replace('\u0130', 'i').replace('\u0131', 'i').toLowerCase(Locale.ROOT);
        String nfd = Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return nfd.replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private static boolean hasPlaceWord(String text, String mustKey) {
        if (mustKey == null || mustKey.isEmpty()) return true;
        String hay = " " + normStr(text) + " ";
        return hay.contains(" " + mustKey);
    }

    private static String streetBase(String raw) {
        if (raw == null) return "";
        String s = raw.trim()
                .replaceAll("(?i)\\b(?:no|nr|lgh|apt|unit)[:.\\s-]*\\d+[a-z]?\\b", "")
                .replaceAll("(?i)\\s+\\d+[a-z]?(?:[-/]\\d+[a-z]?)?$", "")
                .trim();
        return s.length() >= 2 ? s : raw.trim();
    }

    private static String httpGetString(String urlStr, Charset charset, String ua) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(7000);
            conn.setReadTimeout(8000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", ua);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            InputStream is = conn.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            is.close();
            return new String(bos.toByteArray(), charset);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String firstGroup(Matcher m) {
        if (!m.find()) return "";
        String g1 = m.group(1);
        if (g1 != null) return g1.trim();
        String g2 = m.group(2);
        return g2 != null ? g2.trim() : "";
    }

    /**
     * Direct on-device polling from the Android phone (0 Cloudflare Worker requests, scales to unlimited users!).
     * Falls back to Worker `/push/poll` only if direct network fetches fail completely.
     */
    private static JSONArray pollDirectOnDevice(JSONArray places) {
        JSONArray results = new JSONArray();
        JSONArray cachedPolisen = null;
        boolean triedPolisen = false;
        String cachedPhuketXml = null;
        boolean triedPhuket = false;
        Map<String, JSONArray> sigMemo = new HashMap<String, JSONArray>();
        int networkOk = 0;

        int limit = Math.min(places.length(), MAX_FAVS);
        for (int idx = 0; idx < limit; idx++) {
            try {
                JSONObject p = places.optJSONObject(idx);
                if (p == null) continue;
                String label = p.optString("label", "");
                JSONArray parts = p.optJSONArray("parts");
                if (label.isEmpty() || parts == null || parts.length() == 0) continue;

                JSONObject own = parts.optJSONObject(0);
                if (own == null) continue;
                String ownLevel = own.optString("level", "city");
                String ownName = own.optString("name", "");
                String cleanOwn = "street".equals(ownLevel) ? streetBase(ownName) : ownName;

                String ctxName = "";
                for (int k = 1; k < parts.length(); k++) {
                    JSONObject up = parts.optJSONObject(k);
                    if (up != null) {
                        if (ctxName.isEmpty()) ctxName = up.optString("name", "");
                        if ("city".equals(up.optString("level", ""))) {
                            ctxName = up.optString("name", "");
                            break;
                        }
                    }
                }

                String mustKey = "";
                for (String w : normStr(cleanOwn).split(" ")) {
                    if (w.length() >= 3 && w.length() > mustKey.length()) {
                        mustKey = w;
                    }
                }

                String cc = p.optString("cc", "US").toUpperCase(Locale.ROOT);
                boolean wantNews = p.optBoolean("alertNews", true);
                boolean wantForum = p.optBoolean("alertForum", true);
                String sig = cc + "|" + mustKey + "|" + normStr(cleanOwn) + "|" + (wantNews ? "1" : "0") + "|" + (wantForum ? "1" : "0");

                JSONArray items = sigMemo.get(sig);
                if (items == null) {
                    items = new JSONArray();
                    boolean small = "street".equals(ownLevel) || "district".equals(ownLevel);
                    String newsQ = (small && !ctxName.isEmpty())
                            ? ("\"" + cleanOwn + "\" " + ctxName)
                            : ("\"" + cleanOwn + "\"");
                    String forumQ = cleanOwn.length() >= 4
                            ? ("\"" + cleanOwn + "\"")
                            : ((small && !ctxName.isEmpty()) ? (cleanOwn + " " + ctxName) : cleanOwn);

                    if (wantNews) {
                        if ("SE".equals(cc)) {
                            if (!triedPolisen) {
                                triedPolisen = true;
                                String pJson = httpGetString("https://polisen.se/api/events", StandardCharsets.UTF_8, "Mozilla/5.0 (Android; NewzLocalAPK/1.3)");
                                if (pJson != null) {
                                    networkOk++;
                                    try { cachedPolisen = new JSONArray(pJson); } catch (Exception ignored) {}
                                }
                            }
                            if (cachedPolisen != null) {
                                int pCount = 0;
                                for (int e = 0; e < Math.min(cachedPolisen.length(), 150) && pCount < 4; e++) {
                                    JSONObject ev = cachedPolisen.optJSONObject(e);
                                    if (ev == null) continue;
                                    String evName = ev.optString("name", "");
                                    String evSum = ev.optString("summary", "");
                                    JSONObject loc = ev.optJSONObject("location");
                                    String locName = loc != null ? loc.optString("name", "") : "";
                                    String evUrl = ev.optString("url", "");
                                    if (!evUrl.isEmpty() && !evName.isEmpty() && hasPlaceWord(evName + " " + evSum + " " + locName, mustKey)) {
                                        JSONObject hit = new JSONObject();
                                        String evType = ev.optString("type", "");
                                        hit.put("title", "\uD83D\uDEE1 Polisen \u00B7 " + (!evType.isEmpty() ? (evType + ": " + (!evSum.isEmpty() ? evSum : evName)) : evName));
                                        hit.put("url", evUrl.startsWith("http") ? evUrl : ("https://polisen.se" + evUrl));
                                        hit.put("kind", "news");
                                        items.put(hit);
                                        pCount++;
                                    }
                                }
                            }
                        }

                        if ("TH".equals(cc) && "phuket".equals(mustKey)) {
                            if (!triedPhuket) {
                                triedPhuket = true;
                                cachedPhuketXml = httpGetString("https://phuket.tourist.police.go.th/feed/", StandardCharsets.UTF_8, "Mozilla/5.0 (Android; NewzLocalAPK/1.3)");
                                if (cachedPhuketXml != null) networkOk++;
                            }
                            if (cachedPhuketXml != null) {
                                Matcher pm = ITEM_RE.matcher(cachedPhuketXml);
                                int pkCount = 0;
                                while (pm.find() && pkCount < 3) {
                                    String blk = pm.group(1);
                                    String t = firstGroup(TITLE_RE.matcher(blk));
                                    String l = firstGroup(LINK_RE.matcher(blk));
                                    if (!t.isEmpty() && !l.isEmpty()) {
                                        JSONObject hit = new JSONObject();
                                        hit.put("title", "\uD83D\uDEE1 Phuket Police \u00B7 " + t);
                                        hit.put("url", l);
                                        hit.put("kind", "news");
                                        items.put(hit);
                                        pkCount++;
                                    }
                                }
                            }
                        }

                        String bingUrl = "https://www.bing.com/news/search?q=" + URLEncoder.encode(newsQ, "UTF-8") + "&format=rss&cc=" + cc + "&sortbydate=1";
                        String bingXml = httpGetString(bingUrl, StandardCharsets.UTF_8, "Mozilla/5.0 (Android; NewzLocalAPK/1.3)");
                        if (bingXml != null) {
                            networkOk++;
                            Matcher im = ITEM_RE.matcher(bingXml);
                            while (im.find() && items.length() < 10) {
                                String blk = im.group(1);
                                String t = firstGroup(TITLE_RE.matcher(blk));
                                String d = firstGroup(DESC_RE.matcher(blk)).replaceAll("<[^>]+>", " ").trim();
                                String l = firstGroup(LINK_RE.matcher(blk));
                                if (!t.isEmpty() && !l.isEmpty() && hasPlaceWord(t + " " + d, mustKey)) {
                                    JSONObject hit = new JSONObject();
                                    hit.put("title", t);
                                    hit.put("url", l);
                                    hit.put("kind", "news");
                                    items.put(hit);
                                }
                            }
                        }
                    }

                    if (wantForum && !forumQ.isEmpty()) {
                        String rdUrl = "https://www.reddit.com/search.json?raw_json=1&sort=new&limit=12&q=" + URLEncoder.encode(forumQ, "UTF-8");
                        String rdJson = httpGetString(rdUrl, StandardCharsets.UTF_8, "NewzLocalAndroidAPK/1.3");
                        if (rdJson != null) {
                            networkOk++;
                            try {
                                JSONObject rRoot = new JSONObject(rdJson);
                                JSONObject rData = rRoot.optJSONObject("data");
                                JSONArray children = rData != null ? rData.optJSONArray("children") : null;
                                if (children != null) {
                                    for (int c = 0; c < children.length() && items.length() < 15; c++) {
                                        JSONObject cd = children.optJSONObject(c);
                                        JSONObject post = cd != null ? cd.optJSONObject("data") : null;
                                        if (post == null) continue;
                                        String pt = post.optString("title", "");
                                        String ps = post.optString("selftext", "");
                                        String pl = post.optString("permalink", "");
                                        if (!pt.isEmpty() && !pl.isEmpty() && hasPlaceWord(pt + " " + ps, mustKey)) {
                                            JSONObject hit = new JSONObject();
                                            hit.put("title", pt);
                                            hit.put("url", "https://www.reddit.com" + pl);
                                            hit.put("kind", "forum");
                                            items.put(hit);
                                        }
                                    }
                                }
                            } catch (Exception ignored) {}
                        }

                        if ("SE".equals(cc) && !cleanOwn.isEmpty()) {
                            String fbUrl = "https://www.flashback.org/sok/?query=" + URLEncoder.encode(cleanOwn, "UTF-8") + "&so=pd";
                            String fbHtml = httpGetString(fbUrl, StandardCharsets.ISO_8859_1, "Mozilla/5.0");
                            if (fbHtml != null) {
                                networkOk++;
                                Matcher fm = FB_RE.matcher(fbHtml);
                                while (fm.find() && items.length() < 18) {
                                    String href = fm.group(2);
                                    String ft = fm.group(3).replaceAll("<[^>]+>", "").trim();
                                    if (!ft.isEmpty() && href != null && hasPlaceWord(ft, mustKey)) {
                                        JSONObject hit = new JSONObject();
                                        hit.put("title", ft);
                                        hit.put("url", href.startsWith("http") ? href : ("https://www.flashback.org" + (href.startsWith("/") ? href : ("/" + href))));
                                        hit.put("kind", "forum");
                                        items.put(hit);
                                    }
                                }
                            }
                        }
                    }

                    sigMemo.put(sig, items);
                }

                if (items.length() > 0) {
                    JSONObject entry = new JSONObject();
                    entry.put("label", label);
                    entry.put("hash", p.optString("hash", ""));
                    entry.put("cat", p.optString("cat", ""));
                    entry.put("items", items);
                    results.put(entry);
                }
            } catch (Exception ignored) {
            }
        }
        return networkOk > 0 ? results : null;
    }

    private static JSONArray pollViaWorkerFallback(String workerUrl, JSONArray places, String lang) {
        HttpURLConnection conn = null;
        try {
            JSONObject reqBody = new JSONObject();
            reqBody.put("places", places);
            reqBody.put("lang", lang);

            conn = (HttpURLConnection) new URL(workerUrl + "/push/poll").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(12000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("User-Agent", "NewzLocalAndroidAPK/1.3");

            byte[] outBytes = reqBody.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(outBytes);
            os.flush();
            os.close();

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;

            InputStream is = conn.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            JSONObject resp = new JSONObject(sb.toString());
            return resp.optJSONArray("places");
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public static synchronized void pollNow(Context ctx, boolean seedOnlyNew) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String rawPayload = sp.getString(KEY_PAYLOAD, "");
            if (rawPayload == null || rawPayload.isEmpty()) return;

            JSONObject payload = new JSONObject(rawPayload);
            JSONArray places = payload.optJSONArray("places");
            if (places == null || places.length() == 0) return;

            JSONObject quietMap = payload.optJSONObject("quiet");
            String workerUrl = payload.optString("workerUrl", DEFAULT_WORKER).trim();
            if (workerUrl.isEmpty()) workerUrl = DEFAULT_WORKER;
            while (workerUrl.endsWith("/")) {
                workerUrl = workerUrl.substring(0, workerUrl.length() - 1);
            }

            Set<String> seeded = new HashSet<String>();
            JSONArray seededArr = new JSONArray(sp.getString(KEY_SEEDED, "[]"));
            for (int i = 0; i < seededArr.length(); i++) {
                seeded.add(seededArr.optString(i));
            }

            JSONArray targetPlaces = places;
            if (seedOnlyNew) {
                JSONArray unseededOnly = new JSONArray();
                for (int i = 0; i < Math.min(places.length(), MAX_FAVS); i++) {
                    JSONObject p = places.optJSONObject(i);
                    if (p != null && !seeded.contains(p.optString("label", ""))) {
                        unseededOnly.put(p);
                    }
                }
                if (unseededOnly.length() == 0) return;
                targetPlaces = unseededOnly;
            }

            // 1. Poll directly from the user's Android device (0 Cloudflare Worker cost!)
            JSONArray respPlaces = pollDirectOnDevice(targetPlaces);
            // 2. Fallback to Cloudflare Worker only if direct fetches were blocked/offline
            if (respPlaces == null) {
                respPlaces = pollViaWorkerFallback(workerUrl, targetPlaces, payload.optString("lang", "sv"));
            }
            if (respPlaces == null) return;

            JSONObject seenMap = new JSONObject(sp.getString(KEY_SEEN_MAP, "{}"));
            boolean changed = false;

            for (int i = 0; i < respPlaces.length(); i++) {
                JSONObject rp = respPlaces.optJSONObject(i);
                if (rp == null) continue;
                String label = rp.optString("label", "");
                String hash = rp.optString("hash", "");
                String cat = rp.optString("cat", "");
                JSONArray items = rp.optJSONArray("items");
                if (label.isEmpty() || items == null || items.length() == 0) continue;

                JSONArray oldSeenArr = seenMap.optJSONArray(label);
                Set<String> oldSet = new HashSet<String>();
                if (oldSeenArr != null) {
                    for (int j = 0; j < oldSeenArr.length(); j++) {
                        oldSet.add(oldSeenArr.optString(j));
                    }
                }

                boolean wasSeeded = seeded.contains(label);
                List<JSONObject> fresh = new ArrayList<JSONObject>();
                JSONArray mergedSeen = new JSONArray();
                Set<String> mergedDedup = new HashSet<String>();

                for (int j = 0; j < items.length(); j++) {
                    JSONObject it = items.optJSONObject(j);
                    if (it == null) continue;
                    String u = it.optString("url", "");
                    if (u.isEmpty()) continue;
                    if (!oldSet.contains(u)) {
                        fresh.add(it);
                    }
                    if (mergedDedup.add(u) && mergedSeen.length() < 250) {
                        mergedSeen.put(u);
                    }
                }
                if (oldSeenArr != null) {
                    for (int j = 0; j < oldSeenArr.length() && mergedSeen.length() < 250; j++) {
                        String u = oldSeenArr.optString(j);
                        if (!u.isEmpty() && mergedDedup.add(u)) {
                            mergedSeen.put(u);
                        }
                    }
                }

                if (!wasSeeded) {
                    seenMap.put(label, mergedSeen);
                    seeded.add(label);
                    changed = true;
                    continue;
                }
                if (!fresh.isEmpty()) {
                    seenMap.put(label, mergedSeen);
                    changed = true;
                    if (!seedOnlyNew && !inQuietHours(quietMap, cat)) {
                        JSONObject first = fresh.get(0);
                        String kind = first.optString("kind", "news");
                        boolean isForum = "forum".equals(kind);
                        String titlePrefix = (isForum ? "\uD83D\uDCAC " : "\uD83D\uDCF0 ") + label;
                        String firstTitle = first.optString("title", "Ny händelse");
                        String bodyText = fresh.size() > 1
                                ? firstTitle + " (+" + (fresh.size() - 1) + ")"
                                : firstTitle;
                        String deepUrl = hash.isEmpty()
                                ? APP_BASE
                                : APP_BASE + "#p=" + hash + (isForum ? "&tab=forum" : "");
                        NotificationHelper.show(ctx, titlePrefix, bodyText, deepUrl, label + "-" + kind);
                    }
                }
            }

            if (changed) {
                JSONArray nextSeeded = new JSONArray();
                for (String s : seeded) {
                    nextSeeded.put(s);
                }
                sp.edit()
                        .putString(KEY_SEEN_MAP, seenMap.toString())
                        .putString(KEY_SEEDED, nextSeeded.toString())
                        .apply();
            }
        } catch (Exception ignored) {
        }
    }
}
