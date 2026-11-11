package local.x1.journal;

import android.os.Bundle;
import android.content.res.Configuration;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
        registerPlugin(JournalFilesPlugin.class);
        super.onCreate(state);
        updateBackground();
    }
    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        updateBackground();
    }
    private void updateBackground() {
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(getColor(R.color.app_background));
    }
}
