import AppKit
import WebKit

/// Opt-in fixture harness. Uses a nonpersistent WebKit profile and an explicit temporary Ghost root.
enum SmokeTest {
    static func run(browser: Browser) {
        guard ProcessInfo.processInfo.environment["GHOST_ROOT"]?.hasPrefix("/private/tmp/") == true else {
            fputs("Smoke tests require a temporary GHOST_ROOT.\n", stderr); exit(2)
        }
        let tab = browser.add(load: false)
        let controller = tab.web.configuration.userContentController
        let existing = controller.userScripts.map { $0.source }
        controller.removeAllUserScripts()
        let fixture = """
        window.fetch = async function(input, init) {
          const path = String(input); const vars = JSON.parse(init.body).variables;
          let value;
          if (path.endsWith('FavoriteTweet')) value = {data: {favorite_tweet: 'Done'}};
          else if (path.includes('friendships/create')) value = {id_str:'22', screen_name:'sam', name:'Sam', following:true};
          else value = {data: {create_tweet: {tweet_results: {result: {rest_id: vars.reply ? '444' : '333', core:{user_results:{result:{rest_id:'11', legacy:{screen_name:'me',name:'Me'}}}}, legacy:{full_text:vars.tweet_text, in_reply_to_status_id_str:vars.reply?.in_reply_to_tweet_id}}}}}};
          return new Response(JSON.stringify(value), {status:200,headers:{'Content-Type':'application/json'}});
        };
        """
        controller.addUserScript(WKUserScript(source: fixture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        existing.forEach { controller.addUserScript(WKUserScript(source: $0, injectionTime: .atDocumentStart, forMainFrameOnly: true)) }
        tab.web.loadHTMLString("<html><head><title>Ghost capture test</title></head><body><article data-testid='tweet'><a href='https://x.com/sam/status/123'><time>now</time></a><div data-testid='tweetText'>A fixture post.</div></article></body></html>", baseURL: URL(string: "https://x.com/alex/following"))
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            tab.web.evaluateJavaScript("JSON.stringify({installed:!!window.__ghostInstalled,adapter:!!window.GhostXAdapter,bridge:!!window.webkit?.messageHandlers?.ghost,fetch:String(window.fetch).slice(0,100)})") { result, error in print("fixture state:", result ?? "nil", error ?? "") }
            let exercise = """
            (async () => {
              const post = (url, variables) => fetch(url,{method:'POST',body:JSON.stringify({variables})});
              await post('https://x.com/i/api/graphql/fixture/FavoriteTweet',{tweet_id:'123'});
              await post('https://x.com/i/api/1.1/friendships/create.json',{});
              await post('https://x.com/i/api/graphql/fixture/CreateTweet',{tweet_text:'A published post.'});
              await post('https://x.com/i/api/graphql/fixture/CreateTweet',{tweet_text:'A published reply.',reply:{in_reply_to_tweet_id:'123'}});
              await post('https://x.com/i/api/graphql/fixture/UnfavoriteTweet',{tweet_id:'123'});
              return 'done';
            })(); void 0;
            """
            tab.web.evaluateJavaScript(exercise) { _, error in
                if let error { fputs("JS result: \(error.localizedDescription)\n", stderr) }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                do {
                    let files = try FileManager.default.contentsOfDirectory(at: browser.recorder.directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "md" && $0.lastPathComponent != "README.md" }
                    let text = try files.map { try String(contentsOf: $0, encoding: .utf8) }.joined(separator: "\n")
                    guard files.count == 4, text.contains("post.liked"), text.contains("account.followed"), text.contains("post.published"), text.contains("reply.published"), browser.failed.isEmpty else {
                        throw CaptureError.invalid("Expected 4 successful events, got \(files.count). Problem: \(browser.problem ?? "none"). URL: \(tab.web.url?.absoluteString ?? "none")")
                    }
                    browser.toggleCapture()
                    tab.web.evaluateJavaScript("fetch('https://x.com/i/api/graphql/fixture/FavoriteTweet',{method:'POST',body:JSON.stringify({variables:{tweet_id:'999'}})}); void 0")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        let count = (try? FileManager.default.contentsOfDirectory(atPath: browser.recorder.directory.path).filter { $0.hasSuffix(".md") && $0 != "README.md" }.count) ?? -1
                        guard count == 4 else { fputs("Paused capture emitted an event.\n", stderr); exit(1) }
                        print("PASS: WebKit → X adapter → native bridge → four Markdown events; negative action and pause excluded.")
                        exit(0)
                    }
                } catch { fputs("FAIL: \(error.localizedDescription)\n", stderr); exit(1) }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { fputs("Smoke test timed out.\n", stderr); exit(1) }
    }
}
