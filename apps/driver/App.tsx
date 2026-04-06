import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import type { LocationSubscription } from "expo-location";
import type { DeliveryOrder } from "@botix/shared";
import { formatCurrency, orderStatusLabel } from "@botix/shared";
import {
  registerDriverPushToken,
  startLocationTracking,
  stopLocationTracking,
  useDriverDayEarnings,
  updateDriverOrderStatus,
  useAssignedOrders,
  useDriverSession
} from "./src/lib/driverApi";

export default function App() {
  const session = useDriverSession();
  const { orders, error: ordersError } = useAssignedOrders(session.user?.businessId, session.user?.id);
  const dayEarnings = useDriverDayEarnings(session.user?.businessId, session.user?.id);
  const trackingRef = useRef<LocationSubscription | null>(null);
  const [email, setEmail] = useState("driver@botix.cl");
  const [password, setPassword] = useState("Botix123!");
  const [pushNotice, setPushNotice] = useState("");

  if (session.loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>Cargando BOTIX Driver...</Text>
      </SafeAreaView>
    );
  }

  if (!session.user) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginScreen}>
          <View style={styles.loginCard}>
            <Text style={styles.title}>BOTIX Driver</Text>
            <Text style={styles.subtitle}>Ingreso rapido para repartidores</Text>
            {session.error ? <Text style={styles.errorText}>{session.error}</Text> : null}
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Correo"
              placeholderTextColor="#8a97b2"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Contrasena"
              placeholderTextColor="#8a97b2"
              secureTextEntry
            />
            <Pressable style={styles.primaryButton} onPress={() => void session.signIn(email, password)}>
              <Text style={styles.primaryButtonText}>Ingresar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (session.business && !session.business.accessEnabled) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginScreen}>
          <View style={styles.loginCard}>
            <Text style={styles.title}>BOTIX Driver</Text>
            <Text style={styles.subtitle}>Acceso suspendido</Text>
            <Text style={styles.errorText}>
              El negocio esta {session.business.subscriptionStatus} y el acceso fue bloqueado hasta regularizar el pago.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => void session.signOut()}>
              <Text style={styles.primaryButtonText}>Salir</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  useEffect(() => {
    if (!session.user) return;
    void registerDriverPushToken(session.user.id)
      .then(() => setPushNotice("Notificaciones activadas para nuevos pedidos."))
      .catch((error) => setPushNotice(error instanceof Error ? error.message : "No fue posible activar notificaciones."));
  }, [session.user]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Mis pedidos</Text>
            <Text style={styles.subtitle}>{session.user.displayName}</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => void session.signOut()}>
            <Text style={styles.secondaryButtonText}>Salir</Text>
          </Pressable>
        </View>
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Ganancia del dia</Text>
          <Text style={styles.earningsValue}>{formatCurrency(dayEarnings)}</Text>
        </View>
        {pushNotice ? <Text style={styles.infoText}>{pushNotice}</Text> : null}
        {ordersError ? <Text style={styles.errorText}>{ordersError}</Text> : null}
        {!orders.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin pedidos asignados</Text>
            <Text style={styles.emptyText}>Cuando el local te asigne un pedido, aparecera aqui automaticamente.</Text>
          </View>
        ) : null}

        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onStart={async () => {
              if (!session.user) return;
              trackingRef.current?.remove();
              await updateDriverOrderStatus(session.user.businessId, order.id, "en_route");
              trackingRef.current = await startLocationTracking(
                session.user.businessId,
                order.id,
                session.user.id
              );
            }}
            onDelivered={async () => {
              if (!session.user) return;
              trackingRef.current?.remove();
              await stopLocationTracking(session.user.businessId, order.id);
              await updateDriverOrderStatus(session.user.businessId, order.id, "delivered");
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const OrderCard = ({
  order,
  onStart,
  onDelivered
}: {
  order: DeliveryOrder;
  onStart: () => Promise<void>;
  onDelivered: () => Promise<void>;
}) => (
  <View style={styles.orderCard}>
    <View style={styles.orderTop}>
      <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
      <Text style={styles.status}>{orderStatusLabel[order.status]}</Text>
      <Text style={styles.orderTotal}>{formatCurrency(order.total)}</Text>
    </View>

    <Text style={styles.customerName}>{order.customerName}</Text>
    <Text style={styles.address}>{order.address}</Text>
    <Text style={styles.phone}>{order.customerPhone}</Text>

    <View style={styles.itemsBox}>
      {order.items.map((item) => (
        <Text key={item.id} style={styles.itemText}>
          {item.quantity} x {item.name}
        </Text>
      ))}
    </View>

    <View style={styles.buttonStack}>
      <Pressable
        style={styles.mapButton}
        onPress={() =>
          void Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`
          )
        }
      >
        <Text style={styles.secondaryButtonText}>Abrir direccion</Text>
      </Pressable>

      <Pressable
        style={styles.phoneButton}
        onPress={() => void Linking.openURL(`tel:${order.customerPhone.replace(/\s+/g, "")}`)}
      >
        <Text style={styles.secondaryButtonText}>Llamar cliente</Text>
      </Pressable>

      {order.status !== "en_route" ? (
        <Pressable style={styles.primaryButton} onPress={() => void onStart()}>
          <Text style={styles.primaryButtonText}>En camino</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.successButton} onPress={() => void onDelivered()}>
        <Text style={styles.primaryButtonText}>Entregado</Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  container: {
    flex: 1,
    backgroundColor: "#eff4ff"
  },
  content: {
    padding: 18,
    gap: 16
  },
  loginScreen: {
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  loginCard: {
    padding: 22,
    backgroundColor: "#fff",
    borderRadius: 24,
    shadowColor: "#7891c4",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 4
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#20314c"
  },
  subtitle: {
    color: "#6b7992",
    marginTop: 4
  },
  input: {
    backgroundColor: "#f7f9ff",
    borderWidth: 1,
    borderColor: "#d7e1f7",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 14,
    color: "#21324f"
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    gap: 10,
    shadowColor: "#7891c4",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3
  },
  earningsCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    marginBottom: 4,
    shadowColor: "#7891c4",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2
  },
  earningsLabel: {
    color: "#6b7992",
    marginBottom: 4
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#20314c"
  },
  orderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: "800"
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: "800"
  },
  status: {
    color: "#3c7eff",
    fontWeight: "700"
  },
  customerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#21324f"
  },
  address: {
    color: "#61708e"
  },
  phone: {
    color: "#61708e"
  },
  itemsBox: {
    padding: 12,
    backgroundColor: "#f6f8fe",
    borderRadius: 16
  },
  itemText: {
    color: "#4b5974",
    marginBottom: 4
  },
  buttonStack: {
    gap: 10
  },
  primaryButton: {
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "#4d8dff",
    alignItems: "center"
  },
  successButton: {
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "#56b173",
    alignItems: "center"
  },
  mapButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#edf3ff",
    alignItems: "center"
  },
  phoneButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#eef8f1",
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800"
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#edf3ff"
  },
  secondaryButtonText: {
    color: "#3559df",
    fontWeight: "700"
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    gap: 8
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#21324f"
  },
  emptyText: {
    color: "#6b7992",
    textAlign: "center",
    lineHeight: 20
  },
  errorText: {
    color: "#d14343",
    marginTop: 12,
    lineHeight: 20
  },
  infoText: {
    color: "#3559df",
    lineHeight: 20,
    marginBottom: 4
  }
});
