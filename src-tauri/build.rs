fn main() {
    // Tauri 将 ICO 编译进 Windows EXE；显式跟踪源文件，避免增量构建复用旧图标资源。
    println!("cargo:rerun-if-changed=icons/icon.ico");

    println!("cargo:rustc-check-cfg=cfg(has_local_test_fixtures)");
    let fixtures = std::path::Path::new("../tests/fixtures");
    if fixtures.is_dir() {
        println!("cargo:rerun-if-changed={}", fixtures.display());
        if ["quota-pool-cases.json", "model-pricing-aliases.json"]
            .iter()
            .all(|name| fixtures.join(name).is_file())
        {
            println!("cargo:rustc-cfg=has_local_test_fixtures");
        }
    }

    // Unit-test executables also import Common Controls v6 through Tauri's menu
    // stack. Own the manifest at the linker boundary for binaries/tests/examples;
    // Tauri continues to supply the icon and VERSION resource, without a second
    // manifest resource. See tauri-apps/tauri#13948 and its official API example.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new_without_app_manifest(),
        )).expect("failed to build Tauri resources");
        let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-desktop.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    } else {
        tauri_build::build();
    }
}
