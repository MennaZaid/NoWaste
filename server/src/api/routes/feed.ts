// Consumer offers (FR-RES-01, US-26, decision D-65): the routes only read the query and call the C-07 Feed Service.
import type { RequestHandler } from 'express';
import { getOffer, getOfferPhoto, nearbyOffers } from '../../services/routing-feed/feedService.js';

/** GET /listings/nearby?latitude&longitude&radiusKm */
export const nearbyOffersHandler: RequestHandler = async (req, res) => {
  const { latitude, longitude, radiusKm } = req.query;
  res.json(await nearbyOffers({ latitude, longitude, radiusKm }));
};

/** GET /listings/nearby/:id: the product page. */
export const offerHandler: RequestHandler = async (req, res) => {
  res.json(await getOffer(String(req.params.id)));
};

/** GET /listings/nearby/:id/photo */
export const offerPhotoHandler: RequestHandler = async (req, res) => {
  const photo = await getOfferPhoto(String(req.params.id));
  res.type(photo.type).send(photo.data);
};
