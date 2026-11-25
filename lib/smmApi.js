export class SmmApi {
  constructor(apiKey, apiUrl = 'https://minismm.com/api/v2') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  async connect(postData = {}) {
    const params = new URLSearchParams();
    params.append('key', this.apiKey);

    for (const [k, v] of Object.entries(postData)) {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, Array.isArray(v) ? v.join(',') : String(v));
      }
    }

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)',
      },
      body: params.toString(),
    });

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  order(data) {
    return this.connect({ action: 'add', ...data });
  }

  status(orderId) {
    return this.connect({ action: 'status', order: orderId });
  }

  multiStatus(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    return this.connect({ action: 'status', orders: ids });
  }

  services() {
    return this.connect({ action: 'services' });
  }

  refill(orderId) {
    return this.connect({ action: 'refill', order: orderId });
  }

  cancel(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    return this.connect({ action: 'cancel', orders: ids });
  }

  balance() {
    return this.connect({ action: 'balance' });
  }
}
