import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, FlatList, ActivityIndicator, Platform } from 'react-native';
// CAMBIO 1: Importamos SafeArea desde la nueva librería
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';

// CAMBIO 2: Usamos la versión legacy como sugiere el error para mantener compatibilidad
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
    // CAMBIO 3: Envolvemos todo en SafeAreaProvider
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
  const [columna, setColumna] = useState<string[]>([])
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
  
  const totalRecords = data.length;
  const scannedRecords = data.filter(item => item.scanned).length;

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
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'],
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const asset = result.assets[0];
      const fileUri = asset.uri;
      
      // Determinamos codificación
      const isXlsx = asset.name.endsWith('.xlsx');
      const encoding = isXlsx ? 'base64' : 'utf8';
      
      // Leemos el archivo
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: encoding
      });

      let parsedData: DataItem[] = [];

      if (isXlsx) {
        const workbook = XLSX.read(fileContent, { type: 'base64' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        setColumna(jsonData[0]);
        //console.log('Nombres de columnas:', columna);
        if (jsonData.length > 0) {
            const headers = jsonData[0]; 
            
            // Búsqueda dinámica de columnas (UPC y Descripción)
            const upcIndex = headers.findIndex((q: any) => String(q).toUpperCase().includes("DIRECCION"));
            // Buscamos algo que diga DESC o MATERIAL o ARTICULO
            const descIndex = headers.findIndex((q: any) => {
                const head = String(q).toUpperCase();
                return head.includes("DESC") || head.includes("MATERIAL");
            });

            if (upcIndex === -1) {
                Alert.alert("Error de Formato", "No se encontró la columna 'UPC'. Revisa el archivo.");
                setLoading(false);
                return;
            }

            parsedData = jsonData.slice(1).map((row: any, index) => {
                const rawCode = row[upcIndex];
                return {
                    id: index.toString(),
                    code: rawCode ? String(rawCode).trim() : '', 
                    description: descIndex !== -1 ? row[descIndex] : 'Producto sin nombre',
                    scanned: false,
                    originalRow: row
                };
            }).filter(item => item.code !== ''); 
        }

      } else {
        // Lógica para TXT/CSV simple
        parsedData = fileContent.split('\n').map((line, index) => ({
          id: index.toString(),
          code: line.trim(),
          description: 'Cargado de Texto',
          scanned: false,
          originalRow: line
        })).filter(item => item.code !== '');
      }

      setData(parsedData);
      Alert.alert("Éxito", `Se cargaron ${parsedData.length} registros.`);

    } catch (error) {
      console.log(error);
      Alert.alert("Error", "No se pudo leer el archivo. Intenta guardarlo nuevamente como XLSX.");
    } finally {
        setLoading(false);
    }
  };

  const handleBarCodeScanned = async ({ data: rawData }: { data: string }) => {
    if (scanned) return;
    const scannedCode = rawData.trim();
    setScanned(true);

    // Búsqueda
    const itemIndex = data.findIndex(item => item.code === scannedCode);
    
    // ESCENARIO 1: NO EXISTE
    if (itemIndex === -1) {
      await playSound('error'); // Sonido error
      setTimeout(() => {
        setScanned(false)
        console.log("Retrasado por 1 segundo.");
      }, 1000);  
      
      
    }
    // ESCENARIO 2: YA ESCANEADO
    if (data[itemIndex].scanned) {
      await playSound('error'); // Sonido error
      //Alert.alert("⚠️ Repetido", `Este producto ya fue validado antes.\n(${data[itemIndex].description})`, [
      //  { text: "OK", onPress: () => setScanned(false) }
      //]);
      //return;
      setTimeout(() => {
        setScanned(false)
        console.log("Retrasado por 1 segundo.");
      }, 1000); 
    }

    // Marcar como escaneado
    // ESCENARIO 3: ÉXITO
    await playSound('success'); // Sonido éxito
    const newData = [...data];
    newData[itemIndex].scanned = true;
    setData(newData);
    
    // Feedback visual inmediato (opcional cerrar alerta rápido)
    //Alert.alert("✅ Validado", `${newData[itemIndex].description}`, [
    // { text: "Siguiente", onPress: () => setScanned(false) }
    //]);
    setTimeout(() => {
        setScanned(false)
        console.log("Retrasado por 1 segundo.");
      }, 1000); 
  };

  // ... (resto del código anterior se mantiene igual)

  const saveFile = async () => {
    try {
      if (data.length === 0 || columna.length === 0) {
        Alert.alert("Error", "No hay datos o encabezados para exportar.");
        return;
      }

      // 1. Preparamos los encabezados: Los tuyos + la nueva columna
      const encabezadosFinales = [...columna, "Verificacion"];

      // 2. Preparamos el cuerpo: Convertimos cada item en un array simple
      const cuerpoData = data.map(item => {
        // Si originalRow es un array, le pegamos el SI/NO al final
        if (Array.isArray(item.originalRow)) {
          return [...item.originalRow, item.scanned ? "SI" : "NO"];
        }
        
        // Si por alguna razón originalRow no es array, intentamos mapearlo
        // Pero basándonos en tu flujo, esto debería ser un array de valores
        return [...Object.values(item.originalRow), item.scanned ? "SI" : "NO"];
      });

      // 3. Unimos todo: La primera fila son los nombres, las demás el contenido
      const matrizFinal = [encabezadosFinales, ...cuerpoData];

      // 4. Creamos el libro de Excel
      const ws = XLSX.utils.aoa_to_sheet(matrizFinal);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario Verificado");

      // 5. Generamos el binario y guardamos
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `Reporte_${new Date().getTime()}.xlsx`;
      const uri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(uri, wbout, {
        encoding: 'base64'
      });

      // 6. Compartir con el usuario
      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Descargar Reporte Final'
      });

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo construir el archivo Excel.");
    }
  };
  const limpiar = () => {
  Alert.alert(
    "Limpiar datos",
    "¿Estás seguro de que quieres borrar el archivo actual y el progreso?",
    [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "Sí, borrar", 
        onPress: () => {
          setData([]);       // Borra la lista
          setColumna([]);    // Borra los encabezados que creaste
          setShowCamera(false); // Cierra la cámara si estaba abierta
          Alert.alert("Limpio", "Puedes cargar un nuevo archivo.");
        } 
      }
    ]
  );
  };
// ... (resto del componente y estilos)

  if (hasPermission === null) return <View style={styles.center}><Text>Solicitando permisos...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>No hay acceso a la cámara</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Scanner UPC</Text>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
            <Text style={styles.statNumber}>{scannedRecords} / {totalRecords}</Text>
            <Text style={styles.statLabel}>Avance</Text>
        </View>
        <View style={styles.statBox}>
            <Text style={[styles.statNumber, {color: scannedRecords === totalRecords && totalRecords > 0 ? 'green' : 'orange'}]}>
                {totalRecords > 0 ? Math.round((scannedRecords / totalRecords) * 100) : 0}%
            </Text>
            <Text style={styles.statLabel}>Completado</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>        
        <Button title="1. Cargar Excel" onPress={pickDocument} disabled={loading} />
         
        {loading && <ActivityIndicator style={{marginTop: 10}} size="small" color="#0000ff" />}
        
        <View style={{ marginVertical: 10 }}>
            <Button title={showCamera ? "Cerrar Cámara" : "2. Escanear QR/Barras"} color="#4a90e2" disabled={data.length === 0} 
                onPress={() => setShowCamera(!showCamera)} 
            />
        </View>

        <Button title="3. Guardar Reporte" color="#2ecc71" disabled={scannedRecords === 0} 
            onPress={saveFile} 
        />
        <View style={{ marginVertical: 10 }}>
          <Button title="4. Limpiar" onPress={limpiar} color="#e24a5e" disabled={data.length===0} />
        </View>
        
      </View>

      {showCamera && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "upc_e", "code128", "code39"], 
            }}
          />
          <View style={styles.overlay}>
             <Text style={styles.overlayText}>Apunta al código</Text>
          </View>
        </View>
      )}

      {!showCamera && (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          style={{ marginTop: 10, paddingHorizontal: 20 }}
          renderItem={({ item }) => (
            <View style={[styles.item, item.scanned && styles.itemScanned]}>
              <View style={{flex: 1, paddingRight: 10}}>
                <Text style={styles.itemCode}>{item.code}</Text>
                <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
              </View>
              <View style={{justifyContent: 'center', alignItems: 'center'}}>
                  <Text style={{ fontSize: 20 }}>
                    {item.scanned ? "✅" : "⬜"}
                  </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15, paddingHorizontal: 10 },
  statBox: { alignItems: 'center', backgroundColor: 'white', padding: 10, borderRadius: 8, width: '45%', elevation: 2 },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 12, color: '#666' },
  buttonContainer: { paddingHorizontal: 20 },
  cameraContainer: { height: 300, margin: 20, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  overlay: { position: 'absolute', bottom: 15, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
  overlayText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee', marginVertical: 2, borderRadius: 6 },
  itemScanned: { backgroundColor: '#e8f5e9', borderColor: '#c8e6c9' },
  itemCode: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  itemDesc: { fontSize: 12, color: '#666', marginTop: 2 }
});