// ── Supabase Realtime subscription helpers ────────────────────────
const realtime = {
  subscribeToRequest(requestId, onStatusUpdate, onNewComment) {
    if (!window.supabaseClient) return null;
    return window.supabaseClient
      .channel('request:' + requestId)
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'requests', filter: 'id=eq.' + requestId },
          onStatusUpdate)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'comments', filter: 'request_id=eq.' + requestId },
          onNewComment)
      .subscribe();
  },

  subscribeToRequestList(clientId, onInsert, onUpdate) {
    if (!window.supabaseClient) return null;
    return window.supabaseClient
      .channel('requests:' + clientId)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'requests', filter: 'client_id=eq.' + clientId },
          onInsert)
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'requests', filter: 'client_id=eq.' + clientId },
          onUpdate)
      .subscribe();
  },

  unsubscribe(channel) {
    if (channel && window.supabaseClient) window.supabaseClient.removeChannel(channel);
  },
};

Object.assign(window, { realtime });
