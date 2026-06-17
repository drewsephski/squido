(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('comparison-data').textContent);

  var PROMPT_COLORS = [
    '#4f9cf7',
    '#e8a838',
    '#22c55e',
    '#ef4444',
    '#a855f7',
    '#ec4899',
  ];

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    try {
      return marked.parse(text, { breaks: true, gfm: true });
    } catch (e) {
      return escapeHtml(text);
    }
  }

  function highlightCode() {
    document.querySelectorAll('pre code').forEach(function (block) {
      try {
        hljs.highlightElement(block);
      } catch (e) {
        // Ignore highlighting errors
      }
    });
  }

  function renderModelColumn(result, index) {
    var color = PROMPT_COLORS[index % PROMPT_COLORS.length];
    var modelLabel = result.model.provider + '/' + result.model.id;
    var isWinner = result.model.provider + '/' + result.model.id === data.winnerModelId;
    var statusClass = result.success ? '' : 'error';
    var winnerClass = isWinner ? 'winner' : '';

    // Add winner to model header
    var badgeHtml = '';
    if (isWinner) {
      badgeHtml = '<span class="winner-badge">Winner</span>';
    } else if (!result.success) {
      badgeHtml = '<span class="error-badge">Error</span>';
    } else {
      badgeHtml = '<span class="model-badge" style="border-left: 3px solid ' + color + ';">' + modelLabel + '</span>';
    }

    var bodyHtml = '';

    if (!result.success) {
      bodyHtml += '<div class="model-status">Failed</div>';
      if (result.errorMessage) {
        bodyHtml += '<div class="error-message">' + escapeHtml(result.errorMessage) + '</div>';
      }
    } else {
      // Thinking content
      var msg = result.assistantMessage;
      if (msg && msg.content) {
        msg.content.forEach(function (block) {
          if (block.type === 'thinking') {
            bodyHtml += '<div class="thinking-content">' + escapeHtml(block.thinking) + '</div>';
          } else if (block.type === 'text' && block.text.trim()) {
            bodyHtml += '<div class="markdown-content">' + renderMarkdown(block.text) + '</div>';
          }
        });
      }

      // Usage summary
      var usage = result.usage;
      bodyHtml += '<div class="usage-summary">';
      bodyHtml += '<strong>Usage</strong>';
      bodyHtml += '<div class="usage-row"><span>Input tokens</span><span>' + usage.input.toLocaleString() + '</span></div>';
      bodyHtml += '<div class="usage-row"><span>Output tokens</span><span>' + usage.output.toLocaleString() + '</span></div>';
      bodyHtml += '<div class="usage-row"><span>Total tokens</span><span>' + usage.totalTokens.toLocaleString() + '</span></div>';
      bodyHtml += '<div class="usage-row"><strong>Cost</strong><strong>$' + usage.cost.toFixed(6) + '</strong></div>';
      bodyHtml += '<div class="usage-row"><span>Latency</span><span>' + result.latencyMs + 'ms</span></div>';
      bodyHtml += '</div>';
    }

    return '<div class="model-column ' + statusClass + ' ' + winnerClass + '" style="border-top: 3px solid ' + color + ';">' +
      '<div class="model-header">' +
        '<span class="model-name">' + escapeHtml(modelLabel) + '</span>' +
        badgeHtml +
      '</div>' +
      '<div class="model-body">' + bodyHtml + '</div>' +
    '</div>';
  }

  function init() {
    // Render prompt
    document.getElementById('prompt-text').textContent =
      data.prompt.length > 200 ? data.prompt.substring(0, 200) + '...' : data.prompt;

    // Render date
    var dateStr = data.timestamp ? new Date(data.timestamp).toLocaleString() : '';
    document.getElementById('date-text').textContent = dateStr;

    // Render model columns
    var container = document.getElementById('comparison-container');
    if (data.results && data.results.length > 0) {
      data.results.forEach(function (result, index) {
        container.innerHTML += renderModelColumn(result, index);
      });
    } else {
      container.innerHTML = '<div class="model-status">No results</div>';
    }

    // Highlight code after render
    setTimeout(highlightCode, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
