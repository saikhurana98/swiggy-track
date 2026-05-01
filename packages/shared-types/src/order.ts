import { z } from 'zod';

/**
 * Order status taxonomy normalised from raw Swiggy event strings.
 * Source values vary across Swiggy responses (e.g. "Placed", "OrderPlaced",
 * "DE_ASSIGNED") and are mapped into this stable enum by the integration.
 */
export const OrderStatusSchema = z.enum([
  'placed',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'on_the_way',
  'arriving',
  'delivered',
  'cancelled',
  'unknown',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const SwiggyOrderItemSchema = z
  .object({
    name: z.string(),
    quantity: z.number().int().nonnegative(),
    pricePaise: z.number().int().nonnegative(),
  })
  .strict();
export type SwiggyOrderItem = z.infer<typeof SwiggyOrderItemSchema>;

export const DeliveryPartnerSchema = z
  .object({
    name: z.string(),
    phone: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();
export type DeliveryPartner = z.infer<typeof DeliveryPartnerSchema>;

export const SwiggyOrderSchema = z
  .object({
    orderId: z.string().min(1),
    status: OrderStatusSchema,
    rawStatus: z.string(),
    restaurantName: z.string(),
    restaurantId: z.string().optional(),
    items: z.array(SwiggyOrderItemSchema),
    totalPaise: z.number().int().nonnegative(),
    placedAt: z.string().datetime({ offset: true }),
    estimatedDeliveryAt: z.string().datetime({ offset: true }).nullable(),
    deliveredAt: z.string().datetime({ offset: true }).nullable(),
    deliveryPartner: DeliveryPartnerSchema.nullable(),
    deliveryAddress: z.string().optional(),
  })
  .strict();
export type SwiggyOrder = z.infer<typeof SwiggyOrderSchema>;

export const ActiveOrderResponseSchema = z
  .object({
    activeOrder: SwiggyOrderSchema.nullable(),
    lastDelivered: SwiggyOrderSchema.nullable(),
    fetchedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ActiveOrderResponse = z.infer<typeof ActiveOrderResponseSchema>;
