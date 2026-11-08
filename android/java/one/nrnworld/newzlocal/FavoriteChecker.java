package one.nrnworld.newzlocal;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class FavoriteChecker {
    public static final String PREFS = "newzlocal_prefs";
    public static final String KEY_PAYLOAD = "synced_payload";
    private static final String KEY_SEEN_MAP = "seen_map_json";
    private static final String KEY_SEEDED = "seeded_labels_json";
    private static final String DEFAULT_WORKER = "https://newzlocal-proxy.bynrnworld.workers.dev";
    private static final String APP_BASE = "https://nrnworld.one/NewzLocal/";
    public static final int JOB_ID = 4201;

    private FavoriteChecker() {}

    public static void savePayloadAndSchedule(final Context ctx, String payloadJson) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_PAYLOAD, payloadJson).apply();
        schedulePeriodicJob(ctx);
        // Baseline-seed any newly added favourites in the background so only fresh future news triggers alerts
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

            // If only seeding newly added favourites and all current favourites are already seeded, skip network call
            if (seedOnlyNew) {
                boolean anyUnseeded = false;
                for (int i = 0; i < places.length(); i++) {
                    JSONObject p = places.optJSONObject(i);
                    if (p != null && !seeded.contains(p.optString("label", ""))) {
                        anyUnseeded = true;
                        break;
                    }
                }
                if (!anyUnseeded) return;
            }

            JSONObject reqBody = new JSONObject();
            reqBody.put("places", places);
            reqBody.put("lang", payload.optString("lang", "sv"));

            HttpURLConnection conn = (HttpURLConnection) new URL(workerUrl + "/push/poll").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(12000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("User-Agent", "NewzLocalAndroidAPK/1.2");

            byte[] outBytes = reqBody.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(outBytes);
            os.flush();
            os.close();

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                conn.disconnect();
                return;
            }

            InputStream is = conn.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            conn.disconnect();

            JSONObject resp = new JSONObject(sb.toString());
            JSONArray respPlaces = resp.optJSONArray("places");
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

                seenMap.put(label, mergedSeen);
                if (!wasSeeded) {
                    seeded.add(label);
                    changed = true;
                    continue;
                }
                if (!fresh.isEmpty()) {
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
