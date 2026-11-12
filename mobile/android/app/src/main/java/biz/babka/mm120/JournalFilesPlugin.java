package biz.babka.mm120;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "JournalFiles")
public class JournalFilesPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        String type = call.getString("type");
        String content = call.getString("content");
        if (name == null || content == null || content.length() > 10000000) {
            call.reject(getContext().getString(R.string.file_invalid)); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type != null && type.startsWith("text/csv") ? "text/csv" : "application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saveResult");
    }
    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return;
        }
        Intent data = result.getData();
        if (data == null || data.getData() == null) { call.reject(getContext().getString(R.string.file_not_selected)); return; }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
            if (stream == null) throw new IllegalStateException(getContext().getString(R.string.file_unavailable));
            stream.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception error) { call.reject(getContext().getString(R.string.file_save_failed), error); }
    }
}
