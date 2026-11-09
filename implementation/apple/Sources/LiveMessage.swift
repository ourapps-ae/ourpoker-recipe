import Foundation

struct LiveMessage: Decodable {
    let type: String
    let view: GameView?
    let rooms: [RoomInfo]?
    let error: String?
}
