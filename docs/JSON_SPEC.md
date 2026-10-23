# P140 最小 JSON 契約 1.0.0

前台版本 V0.002。此契約固定資料格式與模擬語意，後續增加功能時以 schemaVersion 控制相容性。範例資料全為示範。

## 1. 發布與維護

每條路線一個 JSON，均符合 `network.schema.json`，其 routes 陣列恰有一條路線。`manifest.json` 記錄檔案位置；合併工具驗證後產生一份 `bus_network.json`。前台只載入合併檔一次；拖曳與播放不重讀檔，也不呼叫路由API。

所有分檔必須具有相同 schemaVersion、dataVersion、timezone、generatedAt 與 displaySettings，避免拼接不同發布批次。更新時先修改來源分檔，重新合併，勿手改合併檔。

## 2. 頂層

| 欄位 | 型別／規則 |
|---|---|
| schemaVersion | 固定 `1.0.0` |
| dataVersion | 本批資料的版本字串，與程式版本分開 |
| timezone | 固定 `Asia/Taipei`；所有時間為當地服務日時間 |
| generatedAt | YYYY-MM-DD，本批產生日期，不代表官方生效日 |
| isDemo | 是否包含示範資料；合併檔任何一路為示範即為 true |
| displaySettings | stopLabelBeforeArrivalSec 與 stopLabelAfterDepartureSec，非負整數秒 |
| routes | 路線物件陣列；routeId 全網唯一 |

## 3. 路線與來源

routeId 為穩定識別碼，不使用可變動的顯示文字作主鍵。shortName 為字串，例如 `310`、`紅2`、`海線`；name 保留全名，color 為 #RRGGBB。

各路線內含 sources、stops、patterns、timingProfiles、trips。sources 以 sourceId 為鍵，包含 kind（official/routing/estimated/manual/synthetic）、description，以及選填的 url、retrievedAt。stop、pattern、timingProfile、trip 的 sourceId 必須存在於同一路線 sources。

本版只處理每週規則。未建模生效日期、國定假日或臨時例外，不能因 generatedAt 存在而推定實際日期班表有效。

## 4. 站牌 stops

以 stopId 為鍵，記錄 name、coord、sourceId、verificationStatus。coord 固定為 `[經度, 緯度]`（WGS84）。verificationStatus 為 illustrative、unverified 或 verified。

去回程同名但位置不同的站牌使用不同 stopId。coord 表示實體站牌／候車點，可以在人行道上；公車動畫停靠點由 pattern 的沿線距離決定，不將公車拉離道路去貼站牌。

## 5. 路徑 patterns

以 patternId 為鍵，包含 direction（outbound/inbound/loop/other）、headsign（行駛目的地）、path（沿道路折線）、stopCalls（有序停靠清單）、sourceId 與 verificationStatus。

每個 stopCall 有 stopId、distanceAlongPathM。距離為從此 pattern 起點起算的球面近似累積公尺數，沿路徑不遞減，且不得超過路徑總長（允許2公尺計算容差）。同一站可在迴圈中重複出現，以 stopCalls 索引表示不同次停靠，不可只用 stopId 當停靠次序。

道路折線在資料製作階段取得及確認。無路徑時必須報錯，不能默默用直線代替。控制點、手繪狀態與草稿歷程屬未來編輯器的專案檔，不強迫前台資料攜帶。

## 6. 行車時間 timingProfiles

以 timingProfileId 為鍵，包含 patternId、sourceId、stopTimes。stopTimes 與對應 pattern.stopCalls **依索引一一對應且數量相同**；每筆記錄 arrivalOffsetSec、departureOffsetSec。

秒數相對於起站發車時間：起站兩值均為0；到站 ≤ 離站 ≤ 下一站到站。全程含終點停站最長86400秒。本版以同一時間設定為一組來源；若混合官方時間與估算，description 必須說明，之後可擴充逐站來源。

多班次可共用同一條 pattern、同一組 timingProfile。尖峰時間如不同，另建 timingProfile，無須複製道路。

## 7. 班次 trips

| 欄位 | 規則 |
|---|---|
| tripId | 同一路線唯一；前台用 routeId+tripId 識別全網班次 |
| patternId | 引用同一路線路徑 |
| timingProfileId | 引用時間設定，其 patternId 必須與班次一致 |
| startSec | 服務日00:00起算整數秒，0–86399 |
| days | 1＝週一，…，7＝週日；非空、不得重複 |
| sourceId | 發車時間與適用星期的來源 |

服務日是「起站發車當天」。週日23:55發車、週一00:10仍在途的班次，days 只需含7；查看週一00:10時，前台同時查前一服務日班次。24:00 精確解釋為次日00:00；播放到24:00暫停，不自動循環。

## 8. 動畫與標籤

運行區間為 `[起站發車, 終點離站)`；終點停靠結束即移除。停站區間為 `[到站, 離站)`；站間用時間比例沿道路距離插值，並非兩站經緯度直線插值。

站名顯示區間為 `[到站−before, 離站＋after]`。同地點同名站的顯示合併；有任何班次仍符合就保留。畫面衝突時以停靠、即將抵達、已離站的順序避讓；站名可能因碰撞暫時隱藏，車輛保留。警語持續顯示，不能因 isDemo=false 就將模型位置稱為即時位置。

## 9. 驗證

Schema 負責型別、欄位、座標範圍、列舉值及秒數範圍。程式負責路線與班次唯一性、跨物件引用、停靠點與時間筆數一致、沿線距離範圍、時間單調性及來源存在。通過驗證只代表格式及內部一致，不代表官方內容與地理位置已查證。

## 10. V0.002 動態路徑顯示

不新增JSON欄位。以每班車的當前沿線距離切割 pattern.path，分別繪製已走過虛線與未走實線；切割點與公車座標使用同一插值。停靠期間切割點固定。拖曳到較早時間時重新計算，不保留畫面歷史軌跡。

全路網以低透明度顯示所有行駛中班次的路徑。同一路徑多車可能覆蓋虛實線，不能把合成線型理解為某一特定班次。點選公車可單獨呈現該班分界，其他車輛與站名仍保留。路徑範圍由起站至終站，不是僅下一站。
