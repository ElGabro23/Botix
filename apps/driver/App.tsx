import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { LocationSubscription } from "expo-location";
import { formatCurrency, getOrderStatusMeta, resolveBusinessProfile, type DeliveryOrder } from "@botix/shared";
import {
  registerDriverPushToken,
  startLocationTracking,
  stopAllDriverTracking,
  stopLocationTracking,
  useDriverEarningsSummary,
  updateDriverOrderStatus,
  useAssignedOrders,
  useDriverSession
} from "./src/lib/driverApi";
import { driverBrandAssets } from "./src/lib/brandAssets";

const platformBrandName = "Hunix";
const platformBrandImage = require("./assets/hunix.jpeg");

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export default function App() {
  const session = useDriverSession();
  const businessConfig = resolveBusinessProfile(session.business);
  const loginBrandName = session.business ? businessConfig.brandName : platformBrandName;
  const loginBrandImage = session.business ? driverBrandAssets[businessConfig.logoAsset] : platformBrandImage;
  const { orders, error: ordersError } = useAssignedOrders(session.user?.businessId, session.user?.id);
  const earningsSummary = useDriverEarningsSummary(session.user?.businessId, session.user?.id);
  const trackingRef = useRef<LocationSubscription | null>(null);
  const seenOrderIds = useRef<string[]>([]);
  const [email, setEmail] = useState("driver@botix.cl");
  const [password, setPassword] = useState("Botix123!");
  const [pushNotice, setPushNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [savedCredentialsLoaded, setSavedCredentialsLoaded] = useState(false);
  const [autoLoginTried, setAutoLoginTried] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [manualSignOut, setManualSignOut] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [savedEmail, savedPassword] = await Promise.all([
          AsyncStorage.getItem(savedEmailKey),
          AsyncStorage.getItem(savedPasswordKey)
        ]);
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
      } catch {
        // Keep defaults if local storage is unavailable.
      } finally {
        setSavedCredentialsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!session.user) return;

    void Promise.all([
      AsyncStorage.setItem(savedEmailKey, email),
      AsyncStorage.setItem(savedPasswordKey, password)
    ]).catch(() => undefined);
  }, [session.user, email, password]);

  useEffect(() => {
    if (!savedCredentialsLoaded || session.loading || session.user || autoLoginTried || manualSignOut) return;
    if (!email.trim() || !password.trim()) {
      setAutoLoginTried(true);
      return;
    }

    setAutoLoginTried(true);
    setRestoringSession(true);
    void session
      .signIn(email, password)
      .finally(() => setRestoringSession(false));
  }, [autoLoginTried, email, manualSignOut, password, savedCredentialsLoaded, session.loading, session.user, session]);

  useEffect(() => {
    if (!session.user) {
      setPushNotice("");
      seenOrderIds.current = [];
      return;
    }

    void registerDriverPushToken(session.user.id)
      .then(() => setPushNotice("Notificaciones activadas para nuevos pedidos."))
      .catch((error) => setPushNotice(error instanceof Error ? error.message : "No fue posible activar notificaciones."));
  }, [session.user]);

  useEffect(() => {
    if (!session.user) return;

    const previous = seenOrderIds.current;
    const current = orders.map((order) => order.id);
    const isInitialLoad = previous.length === 0;
    const newOrders = orders.filter((order) => !previous.includes(order.id));

    seenOrderIds.current = current;

    if (isInitialLoad || !newOrders.length) return;

    for (const order of newOrders) {
      void Notifications.scheduleNotificationAsync({
        content: {
          title: "Nuevo pedido asignado",
          body: `Pedido #${order.orderNumber} para ${order.customerName}`
        },
        trigger: null
      });
    }
  }, [orders, session.user]);

  if (session.loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>Cargando {platformBrandName}...</Text>
      </SafeAreaView>
    );
  }

  if (savedCredentialsLoaded && restoringSession && !session.user) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>Restaurando sesion...</Text>
      </SafeAreaView>
    );
  }

  const handleManualSignOut = async () => {
    setManualSignOut(true);
    await stopAllDriverTracking().catch(() => undefined);
    await Promise.allSettled([
      AsyncStorage.removeItem(savedEmailKey),
      AsyncStorage.removeItem(savedPasswordKey)
    ]);
    setAutoLoginTried(true);
    setEmail("");
    setPassword("");
    await session.signOut();
  };

  const exportDriverReportPdf = async () => {
    if (!session.user) return;
    try {
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 28px; color: #20314c; }
              h1 { margin-bottom: 8px; }
              p { color: #5f6d87; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { text-align: left; padding: 12px; border-bottom: 1px solid #d7dff0; }
              th { color: #5f6d87; }
            </style>
          </head>
          <body>
            <h1>${businessConfig.brandName} Driver</h1>
            <p>Resumen de ganancias de ${session.user.displayName}</p>
            <table>
              <tr><th>Periodo</th><th>Monto</th></tr>
              <tr><td>Dia</td><td>${formatCurrency(earningsSummary.day)}</td></tr>
              <tr><td>Semana</td><td>${formatCurrency(earningsSummary.week)}</td></tr>
              <tr><td>Mes</td><td>${formatCurrency(earningsSummary.month)}</td></tr>
            </table>
          </body>
        </html>
      `;
      const result = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setActionError("El PDF fue generado, pero compartir no esta disponible en este equipo.");
        return;
      }
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Resumen del repartidor"
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No fue posible generar el PDF.");
    }
  };

  if (!session.user) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginScreen}>
          <View style={styles.loginCard}>
            <Image source={loginBrandImage} style={styles.brandImage} />
            <Text style={styles.title}>{loginBrandName} Driver</Text>
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
            <Pressable
              style={[styles.primaryButton, { backgroundColor: businessConfig.theme.primary }]}
              onPress={() => {
                setActionError("");
                setManualSignOut(false);
                void session.signIn(email, password);
              }}
            >
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
            <Image source={driverBrandAssets[businessConfig.logoAsset]} style={styles.brandImage} />
            <Text style={styles.title}>{businessConfig.brandName} Driver</Text>
            <Text style={styles.subtitle}>Acceso suspendido</Text>
            <Text style={styles.errorText}>
              El negocio esta {session.business.subscriptionStatus} y el acceso fue bloqueado hasta regularizar el pago.
            </Text>
            <Pressable style={[styles.primaryButton, { backgroundColor: businessConfig.theme.primary }]} onPress={() => void handleManualSignOut()}>
              <Text style={styles.primaryButtonText}>Salir</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Image source={driverBrandAssets[businessConfig.logoAsset]} style={styles.headerImage} />
            <View>
              <Text style={styles.title}>Mis pedidos</Text>
              <Text style={styles.subtitle}>{session.user.displayName}</Text>
            </View>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => void handleManualSignOut()}>
            <Text style={[styles.secondaryButtonText, { color: businessConfig.theme.primary }]}>Salir</Text>
          </Pressable>
        </View>
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Ganancia del dia</Text>
          <Text style={styles.earningsValue}>{formatCurrency(earningsSummary.day)}</Text>
        </View>
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>Reportes</Text>
          <View style={styles.reportRow}>
            <Text style={styles.earningsLabel}>Dia</Text>
            <Text style={styles.reportValue}>{formatCurrency(earningsSummary.day)}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text style={styles.earningsLabel}>Semana</Text>
            <Text style={styles.reportValue}>{formatCurrency(earningsSummary.week)}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text style={styles.earningsLabel}>Mes</Text>
            <Text style={styles.reportValue}>{formatCurrency(earningsSummary.month)}</Text>
          </View>
          <Pressable style={[styles.primaryButton, { backgroundColor: businessConfig.theme.primary }]} onPress={() => void exportDriverReportPdf()}>
            <Text style={styles.primaryButtonText}>Descargar PDF</Text>
          </Pressable>
        </View>
        {pushNotice ? <Text style={styles.infoText}>{pushNotice}</Text> : null}
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
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
            brandPrimary={businessConfig.theme.primary}
            brandSecondary={businessConfig.theme.accent}
            statusLabel={getOrderStatusMeta(businessConfig.orderStatuses, order.status).label}
            productsLabel={businessConfig.labels.products}
            startLabel={getOrderStatusMeta(businessConfig.orderStatuses, "en_route").label}
            deliveredLabel={getOrderStatusMeta(businessConfig.orderStatuses, "delivered").label}
            onStart={async () => {
              if (!session.user) return;
              try {
                setActionError("");
                trackingRef.current?.remove();
                await updateDriverOrderStatus(session.user.businessId, order.id, "en_route");
                trackingRef.current = await startLocationTracking(
                  session.user.businessId,
                  order.id,
                  session.user.id,
                  order.trackingToken
                );
              } catch (error) {
                setActionError(error instanceof Error ? error.message : "No fue posible iniciar el reparto.");
              }
            }}
            onDelivered={async () => {
              if (!session.user) return;
              try {
                setActionError("");
                trackingRef.current?.remove();
                await stopLocationTracking(session.user.businessId, order.id, session.user.id, order.trackingToken);
                await updateDriverOrderStatus(session.user.businessId, order.id, "delivered");
              } catch (error) {
                setActionError(error instanceof Error ? error.message : "No fue posible marcar el pedido como entregado.");
              }
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const OrderCard = ({
  order,
  brandPrimary,
  brandSecondary,
  statusLabel,
  productsLabel,
  startLabel,
  deliveredLabel,
  onStart,
  onDelivered
}: {
  order: DeliveryOrder;
  brandPrimary: string;
  brandSecondary: string;
  statusLabel: string;
  productsLabel: string;
  startLabel: string;
  deliveredLabel: string;
  onStart: () => Promise<void>;
  onDelivered: () => Promise<void>;
}) => {
  const canStartRoute = ["assigned", "ready"].includes(order.status);
  const canMarkDelivered = order.status === "en_route";

  return (
  <View style={styles.orderCard}>
    <View style={styles.orderTop}>
      <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
      <Text style={[styles.status, { color: brandPrimary }]}>{statusLabel}</Text>
      <Text style={styles.orderTotal}>{formatCurrency(order.total)}</Text>
    </View>

    <Text style={styles.customerName}>{order.customerName}</Text>
    <Text style={styles.address}>{order.address}</Text>
    <Text style={styles.phone}>{order.customerPhone}</Text>

    <View style={styles.itemsBox}>
      <Text style={styles.itemsTitle}>{productsLabel}</Text>
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
        style={[styles.phoneButton, { backgroundColor: `${brandSecondary}18` }]}
        onPress={() => void Linking.openURL(`tel:${order.customerPhone.replace(/\s+/g, "")}`)}
      >
        <Text style={[styles.secondaryButtonText, { color: brandSecondary }]}>Llamar cliente</Text>
      </Pressable>

      {canStartRoute ? (
        <Pressable style={[styles.primaryButton, { backgroundColor: brandPrimary }]} onPress={() => void onStart()}>
          <Text style={styles.primaryButtonText}>{startLabel}</Text>
        </Pressable>
      ) : null}

      {canMarkDelivered ? (
        <Pressable style={[styles.successButton, { backgroundColor: brandSecondary }]} onPress={() => void onDelivered()}>
          <Text style={styles.primaryButtonText}>{deliveredLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  </View>
  );
};

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
  brandImage: {
    width: 82,
    height: 82,
    alignSelf: "center",
    marginBottom: 14,
    resizeMode: "contain"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  headerImage: {
    width: 52,
    height: 52,
    resizeMode: "contain"
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
  reportCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: "#7891c4",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#20314c"
  },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  reportValue: {
    fontSize: 16,
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
  itemsTitle: {
    fontWeight: "800",
    color: "#21324f",
    marginBottom: 6
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

const savedEmailKey = "botix.driver.email";
const savedPasswordKey = "botix.driver.password";
