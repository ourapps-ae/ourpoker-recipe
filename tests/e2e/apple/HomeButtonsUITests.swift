import XCTest

// Taps the real light bulb in the top corner of the home screen, over the scrolling room list.
final class HomeButtonsUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    // A fresh home screen, every guide already seen.
    func testLightBulbResponds() throws {
        let app = try launch(guidesSeen: true)
        checkBulb(app)
    }

    func testBeginnerChoiceCanSkipGuidesAndResetBringsThemBack() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-name", "UITester", "-lang", "en", "-beginner", "ask", "-tut.home", "NO"]
        try launchIsolated(app)
        let experienced = app.buttons["No, I know how to play"]
        XCTAssertTrue(experienced.waitForExistence(timeout: 10))
        experienced.tap()
        XCTAssertFalse(app.buttons["Next"].exists)
        let reset = app.buttons["Reset hints"]
        XCTAssertTrue(reset.waitForExistence(timeout: 20))
        reset.tap()
        XCTAssertTrue(app.buttons["Next"].waitForExistence(timeout: 10))
        app.buttons["Skip"].tap()
        XCTAssertFalse(app.buttons["Next"].exists)
        checkBulb(app)
    }

    // After the home guide has been gone through to the end.
    func testLightBulbRespondsAfterTheHomeGuide() throws {
        let app = try launch(guidesSeen: false)
        for _ in 0..<8 {
            let done = app.buttons["Got it!"]
            if done.waitForExistence(timeout: 2) { done.tap(); break }
            let next = app.buttons["Next"]
            XCTAssertTrue(next.waitForExistence(timeout: 20), "the home guide should show")
            next.tap()
        }
        checkBulb(app)
    }

    private func launch(guidesSeen: Bool) throws -> XCUIApplication {
        let app = XCUIApplication()
        // Values in the arguments domain win over the app's saved settings for this launch.
        app.launchArguments = ["-name", "UITester", "-lang", "en", "-AppleLanguages", "(en)", "-beginner", "YES"]
        app.launchArguments += ["-tut.home", guidesSeen ? "YES" : "NO"]
        try launchIsolated(app)
        return app
    }

    private func launchIsolated(_ app: XCUIApplication) throws {
        app.launchArguments += ["-serverURL", try verificationServerURL().absoluteString]
        app.launch()
    }

    private func checkBulb(_ app: XCUIApplication) {
        let help = app.buttons["How to play"]
        XCTAssertTrue(help.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(help.isHittable, "the light bulb is covered:\n" + app.debugDescription)
        help.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5), "the light bulb did not open How to play")
    }
}
