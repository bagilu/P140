// P140：靜態 JSON 版不載入本檔，也不需要 Supabase 設定。
// 供未來核准加入 Supabase 時使用；公開前端僅可使用 publishable key。
// 勿填入 service_role、secret key、密碼或其他機密。
window.P140_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: ''
});
