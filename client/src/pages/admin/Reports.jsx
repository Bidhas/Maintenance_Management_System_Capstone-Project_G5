import { useState } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import useAsync from '../../hooks/useAsync';
import StatCard from '../../components/StatCard';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const monthAgo = iso(new Date(Date.now() - 29 * 86400000));

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [categoryId, setCategoryId] = useState('');
  const [block, setBlock] = useState('');

  const lists = useAsync(async () => {
    const [c, b] = await Promise.all([api.get('/categories', { params: { all: 1 } }), api.get('/blocks')]);
    return { categories: c.data.categories, blocks: b.data.blocks };
  }, []);
  const { data, error, loading, reload } = useAsync(async () => {
    const params = { from, to };
    if (categoryId) params.category_id = categoryId;
    if (block) params.block = block;
    return (await api.get('/reports/summary', { params })).data;
  }, [from, to, categoryId, block]);

  async function exportCsv(type) {
    const params = new URLSearchParams({ from, to, type });
    if (categoryId) params.set('category_id', categoryId);
    if (block) params.set('block', block);
    try {
      const token = localStorage.getItem('cmms_token');
      const r = await fetch(`/api/reports/export?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('export failed');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `cmms-${type}-${from}_${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not export the CSV'); }
  }

  const delta = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
  const totalDelta = data ? delta(data.totals.total, data.previous.total) : null;
  const resDelta = data && data.totals.avg_resolution_hours != null && data.previous.avg_resolution_hours != null
    ? (data.previous.avg_resolution_hours - data.totals.avg_resolution_hours) : null;
  const t = data?.totals;
  const maxCat = data && data.by_category.length ? Math.max(...data.by_category.map((x) => x.count)) : 1;

  return (
    <>
      <div className="fl between">
        <div>
          <h1>Reports and analytics</h1>
          <p className="mu">{from} to {to}</p>
        </div>
        <div className="fl">
          <button type="button" className="btn s xs" onClick={() => exportCsv('requests')}>Export requests CSV</button>
          <button type="button" className="btn s xs" onClick={() => exportCsv('technicians')}>Export technicians CSV</button>
        </div>
      </div>

      <div className="g">
        <div className="filters">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
            <option value="">All categories</option>{(lists.data?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={block} onChange={(e) => setBlock(e.target.value)} aria-label="Block">
            <option value="">All blocks</option>{(lists.data?.blocks || []).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {error && !data && <ErrorBox message={error} onRetry={reload} />}

      <div className="gr">
        <StatCard label="Total requests logged" value={t?.total ?? '—'} hint={totalDelta !== null ? `${totalDelta >= 0 ? '+' : ''}${totalDelta}% vs last period` : undefined} tone="cy" loading={!data} />
        <StatCard label="Avg. resolution time" value={t?.avg_resolution_hours != null ? `${t.avg_resolution_hours}h` : '—'} hint={resDelta != null ? `${resDelta >= 0 ? 'Down' : 'Up'} ${Math.abs(resDelta).toFixed(1)}h vs last period` : undefined} tone="am" loading={!data} />
        <StatCard label="Completion rate" value={t?.completion_rate != null ? `${t.completion_rate}%` : '—'} tone="gr2" loading={!data} />
        <StatCard label="Avg. feedback rating" value={t?.avg_rating != null ? `${t.avg_rating} / 5` : '—'} hint={data && `Based on ${t.rating_count} reviews`} tone="vi" loading={!data} />
      </div>

      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="row">
            <div className="g">
              <h2>Requests by category</h2>
              {data.by_category.length === 0 ? <p className="mu center">No requests in this range.</p> : data.by_category.map((c) => (
                <div key={c.name} className="cat-bar">
                  <div className="top"><span>{c.name}</span><span className="mu">{c.count}</span></div>
                  <div className="bar"><i style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="g">
              <h2>Requests logged per week</h2>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.per_week}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--mu)" />
                    <Tooltip cursor={{ fill: 'rgba(127,127,127,.12)' }}
                      contentStyle={{ background: 'var(--ov)', border: '1px solid var(--gb)', borderRadius: 12, color: 'var(--tx)' }}
                      formatter={(v) => [v, 'Requests']} labelFormatter={(l, p) => p?.[0]?.payload?.week} />
                    <Bar dataKey="count" fill="var(--ac)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="g">
            <h2>Requests by block</h2>
            {data.by_block.length === 0 ? <p className="mu center">No data.</p> : (
              <div className="tw">
                <table>
                  <thead><tr><th>Block</th><th className="right">Requests</th></tr></thead>
                  <tbody>{data.by_block.map((b) => <tr key={b.name}><td>{b.name}</td><td className="right"><b>{b.count}</b></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
