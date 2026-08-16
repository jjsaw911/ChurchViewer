package com.churchviewer.remote;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;

/**
 * The remote, for Android.
 *
 * The same thing as the iPhone one, deliberately: the run sheet is the web page
 * either way, and this supplies only what a browser tab on a phone is bad at —
 * buttons that stay put while the list above them scrolls, a screen that
 * doesn't sleep mid-song, and a session that survives being put in a pocket.
 *
 * Written against the platform with no libraries at all. A remote that a church
 * installs by hand should be a small file that keeps working, not a build with
 * forty dependencies to keep patched; and everything here is one screen, one
 * web view and six buttons.
 */
public class MainActivity extends Activity {

    private static final String ROOT_DOMAIN = "churchviewer.com";
    /** Whatever service the church is on — the same address the projector uses. */
    private static final String RUN_PATH = "/present/today";
    private static final String PLANS_PATH = "/admin/services";

    private WebView web;
    private SharedPreferences settings;

    /** Redrawn when the page says what is happening, so the symbols can follow. */
    private Button playButton;
    private Button blankButton;
    private boolean playing = false;
    private boolean blank = false;
    private boolean canPlay = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        settings = getSharedPreferences("churchviewer", Context.MODE_PRIVATE);

        // A service is an hour long and the operator's hands are busy; a screen
        // that sleeps mid-song is not acceptable.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setFitsSystemWindows(true);

        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        // The page tells the app what is on the screen; the buttons draw it.
        web.addJavascriptInterface(new Bridge(), "ChurchViewerAndroid");

        root.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(controlBar());

        setContentView(root);

        if (church().isEmpty()) askForChurch(true);
        else web.loadUrl(address(RUN_PATH));
    }

    /**
     * Picked up again after being put down.
     *
     * Android closes an app's connections in the background and the page has no
     * way to notice, so it comes back describing whatever was true when it was
     * set down — during a service, a remote quietly showing the wrong song.
     * Loading it again asks the server what is actually on the screen.
     */
    @Override
    protected void onResume() {
        super.onResume();
        if (web != null && !church().isEmpty() && web.getUrl() != null) web.reload();
    }

    /** Back walks the page's history rather than closing the app mid-service. */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // --- the bar -------------------------------------------------------------

    /**
     * Six of the same button.
     *
     * Same size, same shape, same colour, and a symbol rather than a word —
     * the ones every phone already uses, so it reads at a glance and in any
     * language. What changes with state is the symbol itself: play becomes
     * pause while a song runs, and the square fills in while the screen is
     * blanked. A row of competing colours is unreadable at a glance, and a
     * glance is all this gets.
     */
    private LinearLayout controlBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(8), dp(8), dp(8), dp(8));

        bar.addView(key("☰", "Plans", v -> web.loadUrl(address(PLANS_PATH))));
        bar.addView(key("⚙", "Settings", v -> askForChurch(false)));
        bar.addView(key("‹", "Back", v -> press("ArrowLeft")));
        bar.addView(key("›", "Next", v -> press("ArrowRight")));

        playButton = key("▶", "Play", v -> press("p"));
        bar.addView(playButton);

        blankButton = key("▢", "Blank", v -> press("b"));
        bar.addView(blankButton);

        return bar;
    }

    /** One button. There is only one kind. */
    private Button key(String symbol, String label, View.OnClickListener onClick) {
        Button button = new Button(this);
        button.setText(symbol + "\n" + label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        button.setLineSpacing(0f, 0.95f);
        button.setOnClickListener(onClick);
        button.setBackground(face());
        button.setPadding(0, dp(6), 0, dp(6));

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(0, dp(64), 1f);
        params.setMargins(dp(3), 0, dp(3), 0);
        button.setLayoutParams(params);
        return button;
    }

    private GradientDrawable face() {
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(14));
        shape.setColor(Color.argb(36, 128, 128, 128));
        return shape;
    }

    /** Redraw the two buttons that have something to say. */
    private void refresh() {
        if (playButton != null) {
            playButton.setText((playing ? "⏸" : "▶") + "\n" + (playing ? "Pause" : "Play"));
            playButton.setEnabled(canPlay);
            playButton.setAlpha(canPlay ? 1f : 0.35f);
        }
        if (blankButton != null) {
            blankButton.setText((blank ? "■" : "▢") + "\n" + (blank ? "Blanked" : "Blank"));
        }
    }

    // --- talking to the page -------------------------------------------------

    /**
     * Pressing the page's own keys from a native button.
     *
     * The run sheet already listens for arrows, space, B and P, and everything
     * behind them — what "next" means at the end of a song, how the change
     * reaches the projector, who is allowed to do it — lives there. Sending a
     * key is how this borrows all of it rather than writing a second copy that
     * can disagree with the first.
     */
    private void press(String key) {
        if (web == null) return;
        web.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key
                        + "',bubbles:true,cancelable:true}));",
                null);
    }

    /** What the page says is true, so the buttons can show it. */
    private class Bridge {
        @JavascriptInterface
        public void status(boolean isBlank, boolean isPlaying, boolean playable) {
            runOnUiThread(() -> {
                blank = isBlank;
                playing = isPlaying;
                canPlay = playable;
                refresh();
            });
        }
    }

    // --- which church --------------------------------------------------------

    private String church() {
        return settings.getString("church", "");
    }

    private String address(String path) {
        return "https://" + church() + "." + ROOT_DOMAIN + path;
    }

    /**
     * The whole of the setup: the church's name.
     *
     * Not an address. Every church is at `<name>.churchviewer.com`, so asking
     * for the address means asking a volunteer to type a domain they have never
     * typed, on a phone keyboard, five minutes before a service.
     */
    private void askForChurch(boolean first) {
        EditText field = new EditText(this);
        field.setInputType(InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                | InputType.TYPE_TEXT_VARIATION_URI);
        field.setHint("yourchurch");
        field.setText(church());
        field.setGravity(Gravity.CENTER_HORIZONTAL);

        new AlertDialog.Builder(this)
                .setTitle("Your church")
                .setMessage("The first part of your address. If your church is at "
                        + "citychurch." + ROOT_DOMAIN + ", that's \"citychurch\".")
                .setView(field)
                .setPositiveButton("Connect", (dialog, which) -> {
                    String name = nameIn(field.getText().toString());
                    if (name.isEmpty()) {
                        if (first) askForChurch(true);
                        return;
                    }
                    settings.edit().putString("church", name).apply();
                    web.loadUrl(address(RUN_PATH));
                })
                .setNegativeButton(first ? null : "Cancel", null)
                .setCancelable(!first)
                .show();
    }

    /**
     * The church's name out of anything somebody might type or paste.
     *
     * `citychurch`, `citychurch.churchviewer.com`, or a whole address copied
     * off a laptop all name the same church, and all three are things people
     * actually do.
     */
    static String nameIn(String typed) {
        String text = typed == null ? "" : typed.trim().toLowerCase();
        int scheme = text.indexOf("://");
        if (scheme >= 0) text = text.substring(scheme + 3);

        int slash = text.indexOf('/');
        if (slash >= 0) text = text.substring(0, slash);

        int dot = text.indexOf('.');
        if (dot >= 0) text = text.substring(0, dot);

        return text.matches("[a-z0-9-]+") && !text.equals("www") ? text : "";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
