import UIKit
import Capacitor

class TravelBuddyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TravelBuddyPushEnvironment())
        webView?.allowsBackForwardNavigationGestures = true
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = TravelBuddyViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Match the signed build's APNs environment without relying on web build flags.
@objc(TravelBuddyPushEnvironment)
class TravelBuddyPushEnvironment: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TravelBuddyPushEnvironment"
    let jsName = "TravelBuddyPushEnvironment"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "getEnvironment", returnType: CAPPluginReturnPromise)]

    @objc func getEnvironment(_ call: CAPPluginCall) {
        // A Release build installed from Xcode can still use development signing.
        // The embedded provisioning profile is authoritative when present.
        if let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
           let profile = try? Data(contentsOf: url),
           let start = profile.range(of: Data("<plist".utf8)),
           let end = profile.range(of: Data("</plist>".utf8)),
           start.lowerBound < end.upperBound,
           let plist = try? PropertyListSerialization.propertyList(from: profile.subdata(in: start.lowerBound..<end.upperBound), options: [], format: nil) as? [String: Any],
           let entitlements = plist["Entitlements"] as? [String: Any],
           let environment = entitlements["aps-environment"] as? String {
            call.resolve(["environment": environment == "development" ? "sandbox" : "production"])
            return
        }
        // App Store builds may omit the profile; simulators are development only.
        #if DEBUG
        call.resolve(["environment": "sandbox"])
        #else
        call.resolve(["environment": "production"])
        #endif
    }
}
