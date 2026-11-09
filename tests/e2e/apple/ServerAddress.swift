import Foundation
import XCTest

func verificationServerURL() throws -> URL {
    let address = try XCTUnwrap(ProcessInfo.processInfo.environment["OURPOKER_TEST_SERVER_ADDRESS"])
    let url = try XCTUnwrap(URL(string: address))
    guard url.scheme == "http", url.host == "127.0.0.1", let port = url.port, (1...65535).contains(port),
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
        throw NSError(domain: "OurPokerVerification", code: 1, userInfo: nil)
    }
    return url
}
