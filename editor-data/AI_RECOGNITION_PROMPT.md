# P140 官方公車資訊辨識提示詞

請根據我提供的官方圖片或文字，整理公車路線、站序、發車班次與適用星期，輸出下列 JSON。只輸出 JSON，不加程式碼圍欄。

不得臆測不存在的資訊。沒有提供的經緯度一律為 null，不搜尋學校或景點中心代替站牌；不推估途中到站時間。去回程站序如果只靠反轉推定，必須在 warnings 明列待確認。字跡不清、來源日期不明、各圖表矛盾處，保留在 warnings。星期一至日使用1至7；不清楚的「假日」不可自行轉成週六日，該班次先省略並在 warnings 說明。

站點含括號的名稱完整保留。不要自行合併道路兩側同名站。patterns 的 id、name 應穩定表示同一方向／繞駛型態，更新時沿用舊 id。

```json
{
  "recognitionVersion": "1.0.0",
  "routeId": "route_001",
  "shortName": "紅2",
  "name": "紅2 起站－終站",
  "color": "#166b63",
  "source": {
    "title": "官方來源名稱",
    "url": "",
    "date": "",
    "notes": "來源版本與不確定處",
    "images": []
  },
  "warnings": ["待確認項目"],
  "patterns": [
    {
      "id": "route_001_outbound",
      "name": "去程",
      "headsign": "終站",
      "stops": [
        {"name": "起站", "coord": null},
        {"name": "終站", "coord": null}
      ],
      "departures": [
        {"time": "07:10", "days": [1,2,3,4,5,6,7]}
      ]
    }
  ]
}
```

source.date 只填本次資料取得日期；若不確定則留空，不把圖表的服務日期誤填為取得日期。官方生效日期若有提供，寫入 source.notes。
