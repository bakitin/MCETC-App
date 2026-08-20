#main.py

import asyncio
import json

from manejo_de_clientes.worker import ManejoDeClientes
from websocket.worker import Websocket

class Orquestador:
    def __init__(self):
        self.manejoDeClientes = ManejoDeClientes()
        self.websocket = Websocket()

    
    async def handler(self, websocket):
        try:

            mensaje = await websocket.recv()
            objeto = json.loads(mensaje)
            username = objeto["username"]
            cliente_id = username
            clientes = self.manejoDeClientes.obtener_todos_los_clientes()

            if cliente_id not in clientes:
                self.manejoDeClientes.añadir_cliente(cliente_id, websocket)
            else:
                respuesta = {
                    "type": "error",
                    "data": "No puede tener el mismo nombre que otro usuario"
                }
                await websocket.send(json.dumps(respuesta))
            
            # <-------------------------------------------------------------------------->
            async def router(cliente_id, websocket):
                try: 
                    async for mensaje in websocket:
                        
    
                        objeto = json.loads(mensaje)
                        type = objeto["type"]
                        data = objeto["data"]
                        toClientId = objeto.get("to_client_id")
                        

                        clientes = self.manejoDeClientes.saber_clientes_conectados(cliente_id)

                        match type:
                            case "offer":
                                cliente_destino = self.manejoDeClientes.obtener_cliente(toClientId)

                                await self.websocket.send_message( type, data, cliente_destino, cliente_id)



                                #backup no borrar
                                # for id, websocket_destino in clientes.items():
                                #     await self.websocket.send_message( type, data, websocket_destino, cliente_id)
                                             
                            
                            case "answer":
                                cliente_destino = self.manejoDeClientes.obtener_cliente(toClientId)
                                await self.websocket.send_message( type, data, cliente_destino, cliente_id)
                                    
                            
                            case "ice":
                                cliente_destino = self.manejoDeClientes.obtener_cliente(toClientId)
                                await self.websocket.send_message( type, data, cliente_destino, cliente_id)
                                    
                            
                            case "join_notification":
                                await notificar_entrada_de_usuario_nuevo(cliente_id)
                                print(f"usuarios conectados: {self.manejoDeClientes.obtener_todos_los_clientes()}")
                                print("<-------------------------------------------->")
                                    

                            case "id_notification":
                                await notificar_asignamiento_de_id(cliente_id)
                                
                            
                            case "exit_notification":
                                for id, websocket_destino in clientes.items():
                                    await self.websocket.send_exit_notification(websocket_destino, cliente_id)
                                await eliminar_cliente_que_salio_de_llamada(cliente_id)

                                print(f"El cliente {cliente_id} salio de la llamada")
                                print("<-------------------------------------------->")
                                print(f"usuarios conectados: {self.manejoDeClientes.obtener_todos_los_clientes()}")
                                print("<-------------------------------------------->")
                                
                                

                except Exception as error:
                    print(f"Error al recibir y replicar responsabilidades: {error}")

            # <-------------------------------------------------------------------------->
            async def notificar_entrada_de_usuario_nuevo(cliente_id):
                try:
                    clientes = self.manejoDeClientes.saber_clientes_conectados(cliente_id)
                    print(f"El cliente {cliente_id} entro a la llamada")
                    print("<-------------------------------------------->")
                    # print(f"Notificando entrada de {cliente_id} a {list(clientes.keys())}")
                    for id, websocket_destino in clientes.items():
                        await self.websocket.send_join_notification(websocket_destino, cliente_id)
                

                except Exception as error:
                    print(f"Error al enviar notificacion a los usuarios sobre nuevo usuario en la sala {error}")

            # <-------------------------------------------------------------------------->
            async def notificar_asignamiento_de_id(cliente_id):
                try:

                    await self.websocket.send_id_notification(websocket, cliente_id)

                except Exception as error:
                    print(f"Error al enviar notificacion a los usuarios sobre nuevo usuario en la sala {error}")

            # <-------------------------------------------------------------------------->            
            async def eliminar_cliente_que_salio_de_llamada(data):
                try:
                    
                    return self.manejoDeClientes.eliminar_cliente(data)
                

                except Exception as error:
                    print(f"Error al enviar notificacion a los usuarios sobre nuevo usuario en la sala {error}")

            # <-------------------------------------------------------------------------->            
            async def notificar_usuarios_activos_a_usuario_nuevo(cliente_id):
                try:
                    clientes = self.manejoDeClientes.saber_clientes_conectados(cliente_id)
                    ids_existentes = list(clientes.keys())
                    await self.websocket.send_users_in_connection_notification(websocket, ids_existentes)

                except Exception as error:
                    print(f"Error al enviar notificacion a los usuarios sobre nuevo usuario en la sala {error}")

            # <-------------------------------------------------------------------------->
                    
            await notificar_asignamiento_de_id(cliente_id)
            await notificar_usuarios_activos_a_usuario_nuevo(cliente_id)
            await notificar_entrada_de_usuario_nuevo(cliente_id)
            
            await router(cliente_id, websocket)

        except Exception as error:
            print(f"Error al momento de ejecutarse el handler: {error}")
                

    async def main(self):
        try:
            print("Servidor en linea")
            print("<-------------------------------------------->")
            await self.websocket.create_websocket_server(self.handler)

        except Exception as error:
            print(f"Error al momento de ejecutarse el main: {error}")

if __name__ == "__main__":
    try:
        
        orquestador = Orquestador()
        asyncio.run(orquestador.main())
        
    except Exception as error:
            print(f"Error al momento de ejecutar el programa: {error}")