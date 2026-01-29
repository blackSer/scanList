import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
// @ts-ignore
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CameraView, Camera } from 'expo-camera';
import { Audio } from 'expo-av'; // NUEVA IMPORTACIÓN
import * as XLSX from 'xlsx';

interface DataItem {
  id: string;
  code: string;
  description: string;
  scanned: boolean;
  originalRow: any;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

function MainScreen() {
  const [data, setData] = useState<DataItem[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);

  // MÉTODO PARA REPRODUCIR SONIDOS
  async function playSound(type: 'success' | 'error') {
    try {
      const { sound } = await Audio.Sound.createAsync(
        type === 'success' 
          ? require('./assets/success.mp3') 
          : require('./assets/error.mp3')
      );
      await sound.playAsync();
      
      // Liberar memoria cuando el sonido termine
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log("Error al reproducir sonido", error);
    }
  }

  useEffect(() => {
    const getPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      // Pedir permiso de audio también por si acaso (aunque para reproducir no siempre es obligatorio)
      await Audio.requestPermissionsAsync();
    };
    getPermissions();
  }, []);

  const pickDocument = async () => {
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: 'base64'
      });

      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (jsonData.length > 0) {
        const headers = jsonData[0];
        const upcIndex = headers.findIndex((h: any) => String(h).toUpperCase().includes("UPC"));
        const descIndex = headers.findIndex((h: any) => String(h).toUpperCase().includes("DESC"));

        const parsedData = jsonData.slice(1).map((row, index) => ({
          id: index.toString(),
          code: row[upcIndex] ? String(row[upcIndex]).trim() : '',
          description: descIndex !== -1 ? String(row[descIndex]) : 'Sin descripción',
          scanned: false,
          originalRow: row
        })).filter(item => item.code !== '');

        setData(parsedData);
        Alert.alert("Éxito", `Cargados ${parsedData.length} registros.`);
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo leer el Excel.");
    } finally {
      setLoading(false);
    }
  };

  const handleBarCodeScanned = async ({ data: rawData }: { data: string }) => {
    if (scanned) return;
    const scannedCode = rawData.trim();
    setScanned(true);

    const itemIndex = data.findIndex(item => item.code === scannedCode);

    // ESCENARIO 1: NO EXISTE
    if (itemIndex === -1) {
      await playSound('error'); // Sonido error
      Alert.alert("❌ NO EXISTE", `El código ${scannedCode} no está en la lista.`, [
        { text: "OK", onPress: () => setScanned(false) }
      ]);
      return;
    }

    // ESCENARIO 2: YA ESCANEADO
    if (data[itemIndex].scanned) {
      await playSound('error'); // Sonido error
      Alert.alert("⚠️ REPETIDO", `El código ${scannedCode} ya fue verificado.`, [
        { text: "OK", onPress: () => setScanned(false) }
      ]);
      return;
    }

    // ESCENARIO 3: ÉXITO
    await playSound('success'); // Sonido éxito
    const newData = [...data];
    newData[itemIndex].scanned = true;
    setData(newData);
    
    // Opcional: Una alerta pequeña o un toast, pero con el sonido el operario ya sabe que funcionó
    setScanned(false); // Reset automático para permitir el siguiente escaneo rápido
  };

  // ... (Función saveFile se mantiene igual que la anterior)
  const saveFile = async () => {
    try {
        const exportData = data.map(item => [...item.originalRow, item.scanned ? "SI" : "NO"]);
        const ws = XLSX.utils.aoa_to_sheet([["...","...","VALIDADO"], ...exportData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resultado");
        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const uri = FileSystem.documentDirectory + 'reporte.xlsx';
        await FileSystem.writeAsStringAsync(uri, wbout, { encoding: 'base64' });
        await Sharing.shareAsync(uri);
    } catch (e) { Alert.alert("Error al guardar"); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Verificador Acústico</Text>
      
      <View style={styles.statsContainer}>
        <Text style={styles.statText}>Progreso: {data.filter(d=>d.scanned).length} / {data.length}</Text>
      </View>

      <View style={{ padding: 20 }}>
        <Button title="Cargar Archivo" onPress={pickDocument} />
        <View style={{ marginVertical: 10 }}>
          <Button title={showCamera ? "Cerrar Cámara" : "Abrir Escáner"} color="#4a90e2" onPress={() => setShowCamera(!showCamera)} />
        </View>
        <Button title="Exportar Excel" color="green" onPress={saveFile} disabled={data.length === 0} />
      </View>

      {showCamera && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["upc_a", "upc_e", "ean13", "qr", "code128"] }}
          />
        </View>
      )}

      <FlatList
        data={data}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.item, item.scanned && styles.itemScanned]}>
            <Text>{item.code} - {item.description}</Text>
            <Text>{item.scanned ? "✅" : "❌"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', margin: 10 },
  statsContainer: { padding: 10, alignItems: 'center', backgroundColor: '#eee' },
  statText: { fontSize: 18, fontWeight: '600' },
  cameraContainer: { height: 300, overflow: 'hidden', backgroundColor: '#000' },
  item: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#ccc' },
  itemScanned: { backgroundColor: '#d4edda' }
});