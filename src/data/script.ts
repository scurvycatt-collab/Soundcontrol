// Kịch bản "Tấm Cám" (từ KỊCH BẢN - Timeline). Sửa tại đây để đổi nội dung/cue; giữ nguyên `id` đoạn
// vì `id` chính là trường "scene" của âm thanh. `cues` là danh sách âm cần có (rút từ cột Âm thanh & hiệu ứng).
export interface ScriptCue { category: 'BGM' | 'SFX'; name: string }
export interface ScriptSegment {
  id: string; order: number; content: string; characters: string; props: string;
  soundNote: string; dialogue: string; mic: string; cues: ScriptCue[];
}
export interface ScriptScene { number: number; title: string; note: string; segments: ScriptSegment[] }
export const PLAY_TITLE = 'TẤM CÁM';
export const SCRIPT: ScriptScene[] = [
  {
    "number": 1,
    "title": "TẤM BẦN HÀN & BỤT DÂU ĐẬU",
    "note": "",
    "segments": [
      {
        "id": "Đoạn 1.1",
        "order": 1,
        "content": "Tấm ngồi bệt, ôm laptop mở ví ra rũ rũ (không một xu dính túi), đập trán vào bàn phím khóc giãy giụa. Giơ tấm bìa carton ghi: \"0 PUB - 0 CONT\".",
        "characters": "Tấm",
        "props": "Laptop, ví trống, bàn phím, tấm bìa carton (\"0 PUB - 0 CONT\")",
        "soundNote": "Nhạc buồn não nề, tiếng \"Ting\" trừ tiền tài khoản, tiếng thở dài đánh thượt",
        "dialogue": "Không",
        "mic": "",
        "cues": [
          {
            "category": "BGM",
            "name": "Nhạc buồn não nề"
          },
          {
            "category": "SFX",
            "name": "Ting trừ tiền tài khoản"
          },
          {
            "category": "SFX",
            "name": "Thở dài đánh thượt"
          }
        ]
      },
      {
        "id": "Đoạn 1.2",
        "order": 2,
        "content": "Bụt xông ra, tay cầm cốc trà đá, ghế nhựa, bảo Tấm ngồi xuống, giơ tay tát nhẹ vào gáy Tấm một cái.",
        "characters": "Bụt, Tấm",
        "props": "Cốc trà đá",
        "soundNote": "Tiếng sấm sét / hiệu ứng biến hình giật cục",
        "dialogue": "",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Sấm sét / biến hình giật cục"
          }
        ]
      },
      {
        "id": "Đoạn 1.3",
        "order": 3,
        "content": "Bụt rút điện thoại quẹt quẹt, dí màn hình sát mặt Tấm rồi giơ bảng: \"CONTACT PUB TO VÃI CHƯỞNG\".",
        "characters": "Bụt, Tấm",
        "props": "Điện thoại thông minh, bảng (\"CONTACT PUB TO VÃI CHƯỞNG\")",
        "soundNote": "Tiếng quẹt điện thoại / hiệu ứng \"Ting\" công nghệ",
        "dialogue": "",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Quẹt điện thoại"
          },
          {
            "category": "SFX",
            "name": "Ting công nghệ"
          }
        ]
      },
      {
        "id": "Đoạn 1.4",
        "order": 4,
        "content": "Bụt đá đít Tấm một phát giục đi rồi quay lưng bước đi ngầu lòi.",
        "characters": "Bụt, Tấm",
        "props": "Cốc trà đá",
        "soundNote": "Tiếng đá đít \"Bốp\" vui nhộn, tiếng nhạc chuyển động nhanh",
        "dialogue": "",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Đá đít Bốp"
          },
          {
            "category": "BGM",
            "name": "Nhạc chuyển động nhanh"
          }
        ]
      }
    ]
  },
  {
    "number": 2,
    "title": "RƠI RÌU NƠI CÔNG VIÊN",
    "note": "",
    "segments": [
      {
        "id": "Đoạn 2.1",
        "order": 5,
        "content": "Hoàng Tưởng (đại diện Publisher bự) vuốt tóc bóng lộn, đeo kính râm nhảy tưng tửng ra sân khấu.",
        "characters": "Hoàng Tưởng, Cận vệ",
        "props": "Kính râm",
        "soundNote": "Nhạc trend TikTok: Mèn mén à e sá sàn)",
        "dialogue": "Không",
        "mic": "",
        "cues": [
          {
            "category": "BGM",
            "name": "Nhạc trend TikTok (Mèn mén)"
          }
        ]
      },
      {
        "id": "Đoạn 2.2",
        "order": 6,
        "content": "Tấm vác cây rìu đồ chơi to tổ bố chạy theo định pitch deck, vấp chân ngã sõng soài: CÂY RÌU VĂNG THẲNG VÀO CHÂN Hoàng Tưởng.",
        "characters": "Tấm, Hoàng Tưởng, Cận vệ",
        "props": "Cây rìu đồ chơi to tổ bố",
        "soundNote": "Tiếng phanh xe \"kít kít\" gấp gáp",
        "dialogue": "Không",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Phanh xe kít kít"
          }
        ]
      },
      {
        "id": "Đoạn 2.3",
        "order": 7,
        "content": "Tấm ôm mồm chỉ vào cây rìu, thốt lên thật to: \"Ôi, mất rìu!\". Cận vệ của Hoàng Tưởng bắt đầu truy đuổi Tấm.",
        "characters": "Tấm",
        "props": "Cây rìu đồ chơi",
        "soundNote": "Nhạc tình cảm sến súa slow-motion bắt đầu bật",
        "dialogue": "Có thoại",
        "mic": "Tấm (mic để sẵn trên sân khấu)",
        "cues": [
          {
            "category": "BGM",
            "name": "Nhạc sến súa slow-motion"
          }
        ]
      },
      {
        "id": "Đoạn 2.4",
        "order": 8,
        "content": "Hoàng Tưởng ôm ngực, mắt bắn tim lia lịa, cầm rìu lên ngắm rồi thốt lên say đắm: \"Iu mất rồi!\".",
        "characters": "Hoàng Tưởng",
        "props": "Cây rìu đồ chơi",
        "soundNote": "Nhạc tình cảm lãng mạn cao trào, tiếng tim đập thình thịch",
        "dialogue": "Có thoại",
        "mic": "Quang (Cận vệ cầm mic cho Hoàng Tưởng)",
        "cues": [
          {
            "category": "BGM",
            "name": "Nhạc tình cảm cao trào"
          },
          {
            "category": "SFX",
            "name": "Tim đập thình thịch"
          }
        ]
      },
      {
        "id": "Đoạn 2.5",
        "order": 9,
        "content": "Tấm giật mình hoảng hốt chạy thục mạng, bỏ quên cây rìu. Hoàng Tưởng với tay tiếc nuối.",
        "characters": "Tấm, Hoàng Tưởng, Cận vệ",
        "props": "Cây rìu đồ chơi (Hoàng Tưởng giữ)",
        "soundNote": "Bỏ chạy",
        "dialogue": "Không",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Bỏ chạy"
          }
        ]
      }
    ]
  },
  {
    "number": 3,
    "title": "4 THỬ THÁCH CỦA DÌ GHẺ",
    "note": "Bối cảnh: Dì Ghẻ gác chân xỉa răng, Bố Tấm bị trói vào ghế ngậm giẻ lau giãy giụa bất lực",
    "segments": [
      {
        "id": "Ải 1",
        "order": 10,
        "content": "Chị Huệ đeo băng rôn chạy xông ra, túm cổ áo Tấm lôi đi chạy thục mạng vòng quanh phòng. 2 chị em giả vờ chạy, Tấm ngã khụy xuống, Chị Huệ quay lại dìu về đích, gần đến nơi vứt Tấm xuống rồi ăn mừng đi vào. Dì Ghẻ quát tháo ép vượt ải; Tấm kiệt sức ôm chân Dì Ghẻ van xin; Bố Tấm giãy giụa rên \"Ư... ư...\".",
        "characters": "Chị Huệ, Tấm, Dì Ghẻ, Bố Tấm",
        "props": "Băng rôn thể thao, ghế trói Bố Tấm, dây thừng, giẻ lau, tăm xỉa răng",
        "soundNote": "Nhạc dồn dập",
        "dialogue": "Có thoại",
        "mic": "Dì Ghẻ (cầm mic cho mình & Tấm); Quang (tự cầm mic đọc lệnh & mic Bố Tấm)",
        "cues": [
          {
            "category": "BGM",
            "name": "Nhạc dồn dập"
          }
        ]
      },
      {
        "id": "Ải 2",
        "order": 11,
        "content": "Cận vệ (Quang) dõng dạc đọc chiếu lệnh: Hoàng Tưởng mở hội lớn tìm chủ nhân cây rìu. Tấm nghe thấy liền van xin Dì Ghẻ cho đi trẩy hội. Dì Ghẻ quát tháo sỉ vả, quẳng ra cái xô to cắm biển bắt phân loại dép anh Bưởi với dép mọi người, giấy tờ, cáp mạng xong xuôi mới cho đi. Tấm cầm đồ dí sát mắt nheo nheo rồi ôm đầu quỳ lạy van xin tha; Bố Tấm giãy giụa rên \"Ư... ư...\".",
        "characters": "Cận vệ (Quang), Dì Ghẻ, Tấm, Bố Tấm",
        "props": "Chiếu lệnh mở hội, xô to, biển hiệu phân loại dép anh Bưởi & dép mọi người, rổ dây cáp mạng bấm lỗi & đúng, tập giấy A4, cốc in logo AdTrue",
        "soundNote": "Tiếng loa kèn khai hội hoành tráng, tiếng đổ xoảng đồ đạc loảng xoảng, tiếng thở dài ngao ngán",
        "dialogue": "",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Loa kèn khai hội"
          },
          {
            "category": "SFX",
            "name": "Đổ đồ đạc loảng xoảng"
          },
          {
            "category": "SFX",
            "name": "Thở dài ngao ngán"
          }
        ]
      },
      {
        "id": "Ải 3",
        "order": 12,
        "content": "Dì Ghẻ quát mắng cay nghiệt, đẩy ra chồng thùng carton to dán chữ \"100 CONT / THÁNG (TEAM EXPORT)\" bắt Tấm vác. Tấm còng lưng vác rồi ngã bẹp dí dưới sàn, chới với ngửa mặt van xin; Bố Tấm quằn quại rên \"Ư... ư...\".",
        "characters": "Dì Ghẻ, Tấm, Bố Tấm",
        "props": "Chồng thùng carton to dán chữ \"100 CONT / THÁNG (TEAM EXPORT)\"",
        "soundNote": "Tiếng còi tàu thủy inh ỏi (Tu tu xình xịch), tiếng sập đổ thùng hàng",
        "dialogue": "",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Còi tàu thủy"
          },
          {
            "category": "SFX",
            "name": "Sập đổ thùng hàng"
          }
        ]
      },
      {
        "id": "Ải 4",
        "order": 13,
        "content": "Dì Ghẻ tiếp tục hành hạ đày đọa bắt làm thêm việc quá sức. Tấm tức nước vỡ bờ, ôm đầu gào lên than khổ: \"Như này thì làm thế buồi nào được!\" rồi chỉ thẳng mặt Dì Ghẻ nguyền rủa sẽ phải nhận kết cục xứng đáng; Bố Tấm rên \"Ư... ư...\" can ngăn.",
        "characters": "Dì Ghẻ, Tấm, Bố Tấm",
        "props": "Ghế trói Bố Tấm, dây thừng, giẻ lau",
        "soundNote": "Tiếng sấm sét đùng đoàng / Nhạc kịch tính bùng nổ gay cấn",
        "dialogue": "",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Sấm sét đùng đoàng"
          },
          {
            "category": "BGM",
            "name": "Nhạc kịch tính bùng nổ"
          }
        ]
      }
    ]
  },
  {
    "number": 4,
    "title": "IPHONE DUO, BỤI MÊ HOẶC & CÁI THANG CỦA ANH TUẤN",
    "note": "",
    "segments": [
      {
        "id": "Đoạn 4.1",
        "order": 14,
        "content": "Dì Ghẻ cần liên hệ Khương đại nhân mua con \"đô ù\" (iPhone Duo), nhưng mạng Wi-Fi bị mất. Dì Ghẻ túm cổ Tấm đang kiệt sức, nhét cọng cáp ép trèo lên thang gấp sửa router. Tấm mệt mỏi van xin tha nhưng bị ép leo thang; Bố Tấm giãy giụa rên \"Ư... ư...\" can ngăn.",
        "characters": "Dì Ghẻ, Tấm, Bố Tấm",
        "props": "Thang gấp, cọng dây cáp mạng, router trên cao, điện thoại iPhone Duo",
        "soundNote": "Tiếng rớt mạng \"Tút... tút...\" (No Internet) dồn dập",
        "dialogue": "Có thoại",
        "mic": "Dì Ghẻ (cầm mic); Quang (cầm mic cho Bố Tấm)",
        "cues": [
          {
            "category": "SFX",
            "name": "Rớt mạng Tút tút"
          }
        ]
      },
      {
        "id": "Đoạn 4.2",
        "order": 15,
        "content": "Hoàng Tưởng cầm cây rìu lon ton chạy vào tìm chủ nhân. Dì Ghẻ lập tức áp sát, rắc một nắm bụi phép mê hoặc vào mặt Hoàng Tưởng. Hoàng Tưởng choáng váng lảo đảo một chút, mắt đổi sang đờ đẫn si mê rồi hai người bắt đầu ôm ấp, quấn quýt lấy nhau cuồng nhiệt; Bố Tấm ú ớ rên \"Ư... ư...\" phẫn nộ.",
        "characters": "Hoàng Tưởng, Dì Ghẻ, Tấm, Bố Tấm",
        "props": "Cây rìu đồ chơi, túi bụi phép / kim tuyến mê hoặc",
        "soundNote": "Tiếng \"Ting\" ma mị / Nhạc tình ái sến súa quấn quýt lả lướt",
        "dialogue": "",
        "mic": "Quang (cầm mic cho Bố Tấm)",
        "cues": [
          {
            "category": "SFX",
            "name": "Ting ma mị"
          },
          {
            "category": "BGM",
            "name": "Nhạc tình ái sến súa"
          }
        ]
      },
      {
        "id": "Đoạn 4.3",
        "order": 16,
        "content": "Tấm đang cheo leo trên thang nhìn xuống gào: \"Em nè! Pub của em!\". Anh Tuấn IT xách túi kìm bấm mạng bước ra, mặt lạnh tanh không cảm xúc, giơ biển nhỏ: \"CẤM ĐỤNG ROUTER\", hai tay ôm chặt chân thang RUNG LẮC ĐIÊN CUỒNG khiến Tấm chới với.",
        "characters": "Anh Tuấn IT, Tấm, Dì Ghẻ, Hoàng Tưởng, Bố Tấm",
        "props": "Túi kìm bấm mạng, biển nhỏ \"CẤM ĐỤNG ROUTER\", thang gấp",
        "soundNote": "Tiếng nhạc kinh dị kịch tính ghê rợn (Psycho theme) + tiếng rung thang lắc bần bật",
        "dialogue": "",
        "mic": "Quang cầm mic cho Tấm",
        "cues": [
          {
            "category": "BGM",
            "name": "Nhạc kinh dị Psycho"
          },
          {
            "category": "SFX",
            "name": "Rung thang lắc bần bật"
          }
        ]
      },
      {
        "id": "Đoạn 4.4",
        "order": 17,
        "content": "Tấm rơi từ thang xuống \"chết\" nằm bất động (giãy 3 cái rồi ngửa bụng). Quang ra sân khấu nắm chân tha lôi xác Tấm vào cánh gà, chị Dương ôm ảnh thờ nghiêm trang đi sau. Cùng lúc đó, Dì Ghẻ và Hoàng Tưởng đang quấn quýt bỗng \"đứng hình\" (thời gian đóng băng); khi xác Tấm khuất hẳn sau cánh gà mới chuyển động lại. Kết thúc: Dì Ghẻ bế bổng Hoàng Tưởng, Bố Tấm nhảy lò cò cả ghế chạy theo sau, cả đoàn rời sân khấu / cúi chào.",
        "characters": "Toàn bộ đoàn kịch (Tấm, Tuấn IT, Dì Ghẻ, Hoàng Tưởng, Bố Tấm, Quang, Chị Dương, Huệ, Bụt)",
        "props": "Khung ảnh thờ Tấm, kìm bấm mạng, ghế trói Bố Tấm, hoa kết màn",
        "soundNote": "Tiếng Wilhelm scream ngã \"RẦM\" + Nhạc đám ma remix xập xình chuyển sang nhạc chào kết vui nhộn",
        "dialogue": "Không",
        "mic": "",
        "cues": [
          {
            "category": "SFX",
            "name": "Wilhelm scream ngã RẦM"
          },
          {
            "category": "BGM",
            "name": "Nhạc đám ma remix"
          },
          {
            "category": "BGM",
            "name": "Nhạc chào kết vui nhộn"
          }
        ]
      }
    ]
  }
];

export const ALL_SEGMENTS: readonly ScriptSegment[] = SCRIPT.flatMap((s) => s.segments);
const BY_ID = new Map(ALL_SEGMENTS.map((s) => [s.id, s]));
export const getSegment = (id: string): ScriptSegment | undefined => BY_ID.get(id);
/** Cảnh chứa đoạn đó. */
export const sceneOfSegment = (id: string): ScriptScene | undefined => SCRIPT.find((sc) => sc.segments.some((s) => s.id === id));
