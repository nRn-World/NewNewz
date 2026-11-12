package one.nrnworld.newnewz;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;

public final class NotificationHelper {
    public static final String CHANNEL_ID = "newnewz_alerts";
    public static final String POST_NOTIFICATIONS_PERM = "android.permission.POST_NOTIFICATIONS";

    private NotificationHelper() {}

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "NewNewz Nyhetslarm",
                NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Notiser vid nya lokala nyheter, polishändelser och foruminlägg i dina favoriter");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0L, 180L, 80L, 180L});
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    public static boolean hasPermission(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ctx.checkSelfPermission(POST_NOTIFICATIONS_PERM) == PackageManager.PERMISSION_GRANTED;
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    public static void show(Context ctx, String title, String body, String deepUrl, String tag) {
        if (!hasPermission(ctx)) return;
        ensureChannel(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (deepUrl != null && !deepUrl.isEmpty()) {
            openIntent.putExtra("open_url", deepUrl);
        }

        int notifId = ((tag != null && !tag.isEmpty()) ? tag : title).hashCode() & 0x7FFFFFFF;
        PendingIntent pi = PendingIntent.getActivity(
                ctx,
                notifId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = (Build.VERSION.SDK_INT >= 26)
                ? new Notification.Builder(ctx, CHANNEL_ID)
                : new Notification.Builder(ctx);

        Bitmap largeIcon = BitmapFactory.decodeResource(ctx.getResources(), R.mipmap.ic_launcher);
        builder.setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi);

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon);
        }
        if (Build.VERSION.SDK_INT < 26) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }

        nm.notify(notifId, builder.build());
    }
}
