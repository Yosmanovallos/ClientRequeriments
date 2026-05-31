import React from 'react';
import HeroNetwork from '../brand/HeroNetwork';

/**
 * Short dark gradient banner shown above the form / list pages (not the full portal hero).
 * Includes a small version of the animated node network in the corner.
 */
export default function PortalBanner() {
  return (
    <div className="pbanner">
      <div className="pbanner-network"><HeroNetwork /></div>
    </div>
  );
}
