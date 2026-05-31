import React from 'react';
import { IconGrid, IconFolder, IconChevR } from '../Icons';

/**
 * Top breadcrumb strip on the portal home page (the thin green-edged strip above TopNav).
 * Static for now — same items the legacy view-portal.jsx showed.
 */
export default function Breadcrumbs() {
  return (
    <div className="crumbstrip">
      <span className="crumb-apps"><IconGrid size={18} /></span>
      <span className="crumb-div" />
      <span className="crumb"><IconFolder size={16} /> jira</span>
      <IconChevR size={13} className="crumb-sep" />
      <span className="crumb"><IconFolder size={16} /> Documentation</span>
      <IconChevR size={13} className="crumb-sep" />
      <span className="crumb"><IconFolder size={16} /> Quality Assurance</span>
    </div>
  );
}
