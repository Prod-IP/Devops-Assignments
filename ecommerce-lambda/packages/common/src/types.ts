export type Product = {
  productId: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  imageKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type Cart = {
  userId: string;
  items: Array<{ productId: string; quantity: number; price?: number }>;
  updatedAt: string;
  ttl?: number;
};

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type Order = {
  orderId: string;
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  status: OrderStatus;
  total: number;
  shippingAddress: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type UserProfile = {
  userId: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
};

export const ORDER_EVENT_SOURCE = 'ecommerce.orders';
export const ORDER_PLACED = 'ORDER_PLACED';
export const ORDER_UPDATED = 'ORDER_UPDATED';
