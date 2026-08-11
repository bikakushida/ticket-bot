const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildScrapeSummary(html, url) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || 'No title found';
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
  const headings = $('h1, h2, h3')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, 5);

  return {
    url,
    title,
    metaDescription,
    headingCount: headings.length,
    headings,
    textPreview: $('body').text().trim().slice(0, 500),
  };
}

async function pollTicketStatus({ apiUrl, ticketId, apiKey, intervalMs, maxAttempts }) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;

    const statusUrl = ticketId
      ? `${apiUrl.replace(/\/$/, '')}/${ticketId}`
      : apiUrl;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const status = response?.data?.status || response?.data?.state || response?.data?.result;

    if (status && ['confirmed', 'completed', 'succeeded', 'success'].includes(String(status).toLowerCase())) {
      return { status: 'confirmed', response: response.data };
    }

    if (status && ['failed', 'error', 'cancelled', 'denied'].includes(String(status).toLowerCase())) {
      throw new Error(`Ticket purchase failed: ${JSON.stringify(response.data)}`);
    }

    if (attempts >= maxAttempts) {
      return { status: 'pending', response: response.data };
    }

    await sleep(intervalMs);
  }

  return { status: 'pending', response: null };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/tickets/purchase', async (req, res) => {
  try {
    const { url, apiUrl, apiKey, purchasePayload = {}, pollIntervalMs = 2000, maxPollAttempts = 5 } = req.body || {};

    if (!url) {
      return res.status(400).json({ error: 'A url field is required.' });
    }

    if (!apiUrl) {
      return res.status(400).json({ error: 'An apiUrl field is required.' });
    }

    let pageResponse;
    try {
      pageResponse = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });
    } catch (error) {
      return res.status(502).json({
        error: 'Failed to fetch the provided URL.',
        details: error.message,
      });
    }

    const scrapedData = buildScrapeSummary(pageResponse.data, url);

    const purchaseResponse = await axios.post(
      apiUrl,
      {
        ...purchasePayload,
        sourceUrl: url,
        scrapedData,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const purchaseData = purchaseResponse.data || {};
    const ticketId = purchaseData.ticketId || purchaseData.id || purchaseData.orderId;

    let pollingResult = null;

    if (ticketId || purchaseData.pollUrl || purchaseData.statusUrl) {
      pollingResult = await pollTicketStatus({
        apiUrl: purchaseData.pollUrl || purchaseData.statusUrl || apiUrl,
        ticketId,
        apiKey,
        intervalMs: Number(pollIntervalMs),
        maxAttempts: Number(maxPollAttempts),
      });
    }

    return res.json({
      success: true,
      scrapedData,
      purchaseResponse: purchaseData,
      pollingResult,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Ticket purchase flow failed.',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ticket bot server listening on port ${PORT}`);
});
