fn main() {
    // §7.1/§7.6 — the host agent's public Firebase configuration can be baked
    // into the binary at compile time (`option_env!` in tray.rs), because a
    // released archive carries the executable and nothing else — no `.env`
    // travels with it. `option_env!` is resolved during compilation, and cargo
    // does not know that on its own: without these lines, changing one of
    // these variables reuses the previously compiled value and the rebuild
    // looks like it did nothing.
    for var in [
        "DUXO_FIREBASE_API_KEY",
        "DUXO_FIREBASE_DATABASE_URL",
        "DUXO_FIREBASE_PROJECT_ID",
        "DUXO_WEB_APP_URL",
    ] {
        println!("cargo:rerun-if-env-changed={var}");
    }

    tauri_build::build()
}
