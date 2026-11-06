import Phaser from 'phaser';

type Body = ReturnType<Phaser.Physics.Matter.Factory['circle']>;
export class PhysicsCheck extends Phaser.Scene {
  private balls: {body:Body; sprite:Phaser.GameObjects.Arc}[] = [];
  private guide!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private accumulator = 0;
  private aim = 0;
  private power = 0.5;
  private locked: {aim:number; power:number}|null = null;
  constructor(){super('PhysicsCheck');}
  create(){
    this.balls=[]; this.accumulator=0; this.locked=null;
    this.matter.world.autoUpdate=false;
    this.matter.world.setGravity(0,0);
    // Walls are only for this smoke test; the final game uses out-of-play rules.
    this.matter.world.setBounds(36,36,688,408);
    this.add.circle(380,150,84,0x184558).setStrokeStyle(2,0x4b7e8e);
    this.add.circle(380,150,44,0x256274).setStrokeStyle(2,0x4b7e8e);
    for(let i=0;i<8;i++){
      const x=170+(i%4)*135, y=150+Math.floor(i/4)*160;
      const body=this.matter.add.circle(x,y,18,{frictionAir:0.02,restitution:0.7});
      const sprite=this.add.circle(x,y,18,i%2?0xf3c769:0x67d1ce).setStrokeStyle(2,0xffffff);
      this.balls.push({body,sprite});
      this.matter.body.setVelocity(body,{x:i%2?2:-2,y:i<4?1.2:-1.2});
    }
    this.guide=this.add.graphics();
    this.label=this.add.text(20,450,'',{fontSize:'14px',color:'#ffffff'});
    const keyboard=this.input.keyboard;
    const onKey=(event:KeyboardEvent)=>{
      if(event.repeat || (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName))) return;
      if(event.key==='Escape')this.locked=null;
      if(!this.locked){
        if(event.key==='ArrowLeft')this.aim=Math.max(-50,this.aim-2);
        if(event.key==='ArrowRight')this.aim=Math.min(50,this.aim+2);
        if(event.key==='ArrowUp')this.power=Math.min(1,this.power+0.05);
        if(event.key==='ArrowDown')this.power=Math.max(0,this.power-0.05);
        if(event.key==='Enter')this.locked={aim:this.aim,power:this.power};
      }
      if(event.code==='Space' && this.locked){
        const angle=this.locked.aim*Math.PI/180, speed=3+10*this.locked.power;
        this.matter.body.setVelocity(this.balls[0].body,{x:Math.sin(angle)*speed,y:-Math.cos(angle)*speed});
        this.locked=null;
      }
    };
    keyboard?.on('keydown',onKey);
    const onPointer=()=>this.game.canvas.focus();
    this.events.once('shutdown',()=>{keyboard?.off('keydown',onKey);this.input.off('pointerdown',onPointer);});
    this.game.canvas.tabIndex=0;
    this.input.on('pointerdown',onPointer);
    document.querySelector('#physics-status')!.textContent=`Phaser ${Phaser.VERSION} · Matter · 8 球 · 固定步长 60 Hz`;
  }
  update(_time:number,delta:number){
    this.accumulator=Math.min(this.accumulator+delta,5*1000/60);
    while(this.accumulator>=1000/60){this.matter.world.step(1000/60);this.accumulator-=1000/60;}
    for(const {body,sprite} of this.balls)sprite.setPosition(body.position.x,body.position.y);
    const shot=this.locked??{aim:this.aim,power:this.power};
    const radians=shot.aim*Math.PI/180, length=60+shot.power*180;
    this.guide.clear().lineStyle(3,this.locked?0xf3c769:0xffffff,0.9);
    this.guide.lineBetween(380,410,380+Math.sin(radians)*length,410-Math.cos(radians)*length);
    this.label.setText(`角度 ${shot.aim.toFixed(0)}°   力度 ${shot.power.toFixed(2)}   ${this.locked?'已锁定':'实时调整'}   环境验证示例`);
    this.game.canvas.dataset.phase=this.locked?'armed':'adjust';
    this.game.canvas.dataset.aim=String(shot.aim);
  }
}
