package nrnworld.newnewz;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;

public class FavoriteNewsJobService extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context appCtx = getApplicationContext();
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    FavoriteChecker.pollNow(appCtx, false);
                } finally {
                    jobFinished(params, false);
                }
            }
        });
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
