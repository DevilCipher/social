import {useState} from 'react';
import {ArrowUpRight, RefreshCw, Send} from 'lucide-react';
import {NETWORKS, canRetryDelivery, deliveryStatuses, istDate} from '../lib/model.mjs';

const filters = [
  ['all', 'All deliveries'],
  ['attention', 'Needs attention'],
  ['active', 'In progress'],
  ['published', 'Published'],
];
const attention = ['partial', 'failed', 'needs_review'];
const active = ['queued', 'publishing', 'processing'];

export function DeliveryResults({post, canRetry, onRetry}) {
  return <div className="delivery-results">
    {post.networks.map(id => {
      const result = post.results?.[id];
      const network = NETWORKS.find(network => network.id === id);
      const status = result?.status || (!deliveryStatuses.includes(post.status) || active.includes(post.status) ? post.status : 'unknown');
      const label = {
        accepted: 'Awaiting confirmation',
        uncertain: 'Unconfirmed',
        unknown: 'No result recorded',
        needs_review: 'Needs review',
      }[status] || status.replaceAll('_', ' ');

      return <div className="delivery-result" key={id}>
        <div><strong>{network?.name || id}</strong><span className={'status '+status}>{label}</span></div>
        {result?.detail && <p>{result.detail}</p>}
        {result?.attemptedAt && <small>Last attempt {istDate(result.attemptedAt)} IST</small>}
        {result?.url && /^https:\/\//i.test(result.url) &&
          <a className="text-button" href={result.url} target="_blank" rel="noreferrer">View post <ArrowUpRight size={14}/></a>}
        {canRetry && canRetryDelivery(post, id) &&
          <button className="secondary" onClick={() => onRetry(post, id)}><RefreshCw size={14}/>Retry {network?.name || id}</button>}
      </div>;
    })}
  </div>;
}

export default function DeliveryDashboard({posts, ready, onOpen}) {
  const [filter, setFilter] = useState('all');
  const deliveries = posts.filter(post => deliveryStatuses.includes(post.status));
  const matches = deliveries.filter(post => filter === 'all' ||
    (filter === 'attention' && attention.includes(post.status)) ||
    (filter === 'active' && active.includes(post.status)) || post.status === filter);

  return <section className="card delivery-dashboard">
    <div className="filters">
      <div className="tabs" aria-label="Filter deliveries">
        {filters.map(([id, label]) => <button key={id} aria-pressed={filter === id}
          className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
    </div>
    {matches.length > 0 ? matches.map(post => <article className="delivery-post" key={post.id}>
      <div className="section-heading">
        <div>
          <h2>{post.title || post.caption || 'Media post'}</h2>
          <p>Updated {istDate(post.updatedAt)} IST</p>
        </div>
        <button className="secondary" onClick={() => onOpen(post)}>View details <ArrowUpRight size={14}/></button>
      </div>
      <DeliveryResults post={post}/>
    </article>) : <div className="empty">
      <Send size={24}/>
      <h3>{!ready ? 'Loading deliveries…' : deliveries.length ? 'No matching deliveries' : 'No deliveries yet'}</h3>
      {ready && !deliveries.length && <p>Delivery results appear here after you publish a post.</p>}
    </div>}
  </section>;
}
