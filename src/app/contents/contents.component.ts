import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore'; // 追加
import axios from 'axios';
import { Chart } from 'chart.js';
import { map } from 'rxjs/operators';

import { environment } from '../../environments/environment.prod';

@Component({
  selector: 'app-contents',
  templateUrl: './contents.component.html',
  styleUrls: ['./contents.component.scss'],
})
export class ContentsComponent implements OnInit {
  // グラフ用変数
  chart;
  // 選ばれた地域を入れる変数
  selectedArea: any;
  // 最後に表示する分別結果
  lastResult;
  // 信頼度
  confidence;
  // 選択肢を入れる配列
  detailedTags = [];

  // ゴミのタグを入れる変数
  area = {};
  // 地域固有の値を入れる変数
  garbage = {};

  // 定数宣言部 大阪市
  recycle = 'recycle';
  plastic = 'plastic';
  paper = 'paper';
  normal = 'normal';

  // 定数宣言部 渋谷区
  inflammable = 'inflammable';
  unflammable = 'unflammable';
  isHidden: boolean = false;
  selectedTag = '';
  imageData;
  isLoaded: boolean = false;
  garbages;
  // 各地域固有の分別方法の定義
  // 第一の配列は分別方法の定義
  // 第二配列はそれぞれの分別に当てはまるタグがあったときに対してどれくらいのスコアを計上するか
  // 第三配列は各分別の総合得点を定義
  // 第四配列はそれぞれの分別方法の日本語訳 これが最後の画面に出力される

  // 分別種類別スコアについて
  // 例えば資源ごみのスコアの値が高ければ資源ごみに分別される可能性が高いので、そのように分別
  // 各スコアの得点付けはapiから返ってくる値をもとに算出
  // 詳しい算出方法は各処理に記述

  // 分別ごとに加算するスコアが違う点について
  // 平均的に0.4としているのは、tagのconfidenceを参考にしているため
  // tagのconfidenceの高い値は信頼度が高い
  // confidenceと同じような値(0.9程度)を入れると、その信頼度を我々の分析に活かせない
  // ゆえにdescriptionは補助的に利用することにする
  // 高いconfidenceの数値をこのdescriptionが簡単に上回らないように、
  // 高いconfidenceの値の半分程度の値を代入している

  // DI（依存性注入する機能を指定）
  constructor(private db: AngularFirestore) {
    const docRef = db
      .collection('garbage')
      .doc('shibuya')

    docRef.valueChanges().pipe(
      map(x => {
        return x
      })).subscribe((x)=>{
        console.log(x)
        this.garbages = x
      })
  }

  onChangeAreaSelect(): void {
    // this.selectedArea = $('#area-select option:selected').val();
    console.log(this.selectedArea);
    this.area = this.getArea();
    // this.garbage = this.getGarbage(this.selectedArea);
  }

  onChangeFile(e): void {
    var file = e.target.files[0];
    if (!file) {
      return;
    }
    this.isHidden = true;

    // // 選択したファイルのイメージを表示する
    var reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      this.imageData = e.target.result;
      this.isLoaded = true;
    };

    var file_reader = new FileReader();
    file_reader.readAsArrayBuffer(file);
    file_reader.onload = async (e) => {
      const MY_DOMAIN = environment.azure.AZURE_API_DOMAIN;
      const MY_SUBSCRIPTION_KEY = environment.azure.AZURE_SUBSCRIPTION_KEY;
      const contents = file_reader.result;
      new URLSearchParams();
      const params = {
        // Request parameters
        visualFeatures: 'Tags,Categories,Description',
        language: 'en',
      };
      const urlParams = new URLSearchParams(params);
      const url = `https://${MY_DOMAIN}/vision/v3.0/analyze?${urlParams}`;
      const config = {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Ocp-Apim-Subscription-Key': MY_SUBSCRIPTION_KEY,
        },
      };
      const data = await axios
        .post(url, contents, config)
        .then((response) => {
          console.log(response);
          return response.data;
        })
        .catch((e) => {
          console.error(e);
          alert('error');
        });

      // 全てのスコアをゼロにする
      this.area[this.selectedArea].forEach((area)=>{
        area.score = 0
      })
      this.getTags(data);
      this.getDescription(data);
      this.getCaptions(data);
      this.getCategories(data);
      // 計上したスコアを比較、最も高いものを分析結果として表示
      var sum = function (arr) {
        return arr.reduce(function (prev, current, i, arr) {
          return prev + current;
        });
      };
      var confSum = sum(this.area[this.selectedArea].map(area => area.score));
      var check = Math.max.apply(null, this.area[this.selectedArea].map(area => area.score));

      this.confidence = (check / confSum) * 100;
      this.confidence = Math.floor(this.confidence);
      this.lastResult = this.area[this.selectedArea].find(area => area.score === check).jpn;

      this.createGraph();
      this.isFinished = true;
    };
  }

  onClickBtnSuccess(e): void {
    console.log(this.selectedTag);
    if (!this.selectedTag) {
      alert('再分析するには、まず選択肢を選んでください');
      return;
    }
    if (this.selectedTag == 'わからない') {
      alert(
        'すみませんが、このゴミに関してはお力になれません。地域の環境局に電話してみてください。'
      );
      return;
    }
    this.createReview(this.selectedTag);
    this.isReviewed = true;
  }

  checkIfAreaIsSelected(): void {
    if (this.selectedArea === 'default') {
      alert('先に地域を入力してください');
      return;
    }
    // $('#file').click();
  }

  getTags(data) {
    // tagsの処理
    // apiから返ってくるtagsという配列の値を利用してスコア付けをする
    data.tags.forEach(tag => {
      // garbage配列にないものはfor文をスキップする
      if (this.garbages[tag.name] == undefined) {
        return;
      }
      // tagsにはそれぞれの分析結果に対してconfidenceが存在する
      this.garbages[tag.name].sortings.forEach((sorting, i, array)=>{
        // confidenceをlengthで割る
        // 複数カテゴリーにまたがるtagに対して、その影響を相対的に小さくするための数値
        // たとえば、plasticは三種類ものゴミの可能性があるタグに対し、
        // newspaperはほぼ古紙・衣類に分別される
        // 得点のかさみ付けをしなければ、plasticはnewspaperと「同じ重さの」スコアを複数カテゴリーにばらまくことになる
        // 結果として、plasticがなんらかの間違いで新聞の画像に入っていた場合、
        // ４種類の分別種類スコアが近しい点数を示す可能性が存在することになる
        // それを避けるために、点数のかさみ付けをする
        const score = tag.confidence / array.length
        this.area[this.selectedArea].find(sort=>sort.name === sorting).score += score
      })
      // 抽出されたタグに対して、分析結果後表示する選択肢を配列に入れる
      this.garbages[tag.name].options.forEach((option)=>{
        if (
          !this.detailedTags.includes(option.option)
        ) {
          this.detailedTags.push(option.option);
        }
      })
    })
  }

  // descriptionの処理
  // descriptionについても、処理内容はtagsと同様
  // 異なる点は、ゴミのtagが検出された際、confidenceでなく、
  // それぞれ固有の値を入れる点
  // 固有の値はareaに入っている配列を参照する
  getDescription(data) {
    data.description.tags.forEach((tag)=>{
      if (this.garbages[tag] == undefined) {
        return;
      }
      this.garbages[tag].sortings.forEach((sorting,i,array)=>{
        const score = this.area[this.selectedArea].find((sort)=>{
          return sort.name === sorting
        }).confidence / array.length
        this.area[this.selectedArea].find((sort)=>{
          return sort.name === sorting
        }).score += score
      })
      // 抽出されたタグに対して、分析結果後表示する選択肢を配列に入れる
      this.garbages[tag].options.forEach((option)=>{
        if (
          !this.detailedTags.includes(option.option)
        ) {
          this.detailedTags.push(option.option);
        }
      })
    });
  }

  getCaptions(data) {
    // descriptionのcaptionの処理
    // captionをスペースで区切り、分析している
    // 分析方法は上記二つとほぼ同様
    if (typeof data.description.captions[0] !== 'undefined') {
      var str = data.description.captions[0].text;
      var result = str.split(' ');
      result.forEach((res)=>{
        if (this.garbages[res] == undefined) {
          return;
        }
        this.garbages[res].sortings.forEach((sorting,i,array)=>{
          const score = this.area[this.selectedArea].find((sort)=>{
            return sort.name === sorting
          }).confidence / array.length
          this.area[this.selectedArea].find((sort)=>{
            return sort.name === sorting
          }).score += score
        })

        this.garbages[res].options.forEach((option)=>{
          if (
            !this.detailedTags.includes(option.option)
          ) {
            this.detailedTags.push(option.option);
          }
        })
      })
    }
  }

  getCategories(data) {
    // カテゴリーについても分析している
    // 分析方法は同様
    // ただしカテゴリーは複数種類にまたがるtagは存在しない
    // また出現する値としてはdrink_canのようにそのものずばりなものが多いため、
    // 計上するスコアも高くしている
    // ただし処理の実行頻度は高くなく、削っても良いとは考える
    data.categories.forEach((category)=>{
      if (this.garbages[category.name] == undefined) {
        return;
      }
      this.garbages[category.name].sortings.forEach((sorting)=>{
        const score = this.area[this.selectedArea].find((sort)=>{
          return sort.name === sorting
        }).confidence * 2
        this.area[this.selectedArea].find((sort)=>{
          return sort.name === sorting
        }).score += score
      })
    })
  }

  createGraph() {
    // グラフ作成部
    // グラフに表示するデータ部分
    var mydata = {
      labels: this.area[this.selectedArea].map(area => area.jpn),
      datasets: [
        {
          hoverBackgroundColor: 'rgba(255,99,132,0.3)',
          data: this.area[this.selectedArea].map(area => area.score),
        },
      ],
    };
    // $('.chartjs-hidden-iframe').remove();
    // オプション設定
    const options = {
      title: {
        display: true,
        text: 'ゴミ種類別スコア',
      },
      legend: {
        display: false,
      },
    };
    const canvas: any = document.getElementById('stage');
    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new Chart(canvas, {
      type: 'bar', //グラフの種類
      data: mydata, //表示するデータ
      options: options, //オプション設定
    });
  }

  isFinished: boolean = false;

  // createScreen() {
  //   var myPromise = $.when(
  //     //先に終わらせたい処理を
  //     $('.sub-area').slideUp(500),
  //     $('.result-area').slideUp(500),
  //     $('.tap').slideUp(500),
  //     $('.graph').slideUp(500)
  //   );
  //   myPromise.done(function () {
  //     //後に実行したい処理
  //     $('.result-area').empty();
  //     if (this.detailedTags.length > 1) {
  //       $('.result-area').append(
  //         "<h2 class='result'>" + this.lastResult + 'の可能性が高いです</h2>'
  //       );
  //       $('.result-area').append(
  //         "<h5 class='result-p'>信頼度: " + this.confidence + '%</h5>'
  //       );
  //       // detailedTagsに入っている各選択肢を表示する
  //       $('.radio-box').empty();
  //       this.detailedTags.push('わからない');
  //       for (var i = 0; i < this.detailedTags.length; i++) {
  //         $('.radio-box').append(
  //           '<input type="radio" name="selectedTag" value="' +
  //           this.detailedTags[i] +
  //             '" id="' +
  //             this.detailedTags[i] +
  //             '">'
  //         );
  //         $('.radio-box').append(
  //           '<label for="' +
  //           this.detailedTags[i] +
  //             '">' +
  //             this.detailedTags[i] +
  //             '</label>'
  //         );
  //       }
  //       $('.sub-area').slideDown(500);
  //       $('.result-area').slideDown(500);
  //       $('.analyze-other-div').slideDown(500);
  //       $('.graph').slideDown(500);
  //     } else {
  //       $('.result-area').append(
  //         "<h2 class='result result-error'>分析ができませんでした。地域の環境局にお電話ください</h2>"
  //       );
  //       $('.result-area').append(
  //         "<a href='index.html'><button class='btn'>トップに戻る</button></a>"
  //       );
  //       $('.result-area').slideDown(500);
  //     }
  //   });
  // }
  isReviewed: boolean = false;
  createReview(searchVal) {
    let converted;
    Object.keys(this.garbages).forEach(key => {
      this.garbages[key].options.forEach(option => {
        if(option.option === searchVal){
          converted = option.sorting
        }
      })
    })
    this.lastResult = this.area[this.selectedArea].find(area => area.name === converted).jpn
  }

  getArea() {
    let area = {
      osaka: [],
      shibuya: [],
    };
    area['osaka'] = [
      {
        name: "recycle",
        confidence: 0.4,
        score: 0,
        jpn: "資源ごみ"
      },
      {
        name: "plastic",
        confidence: 0.5,
        score: 0,
        jpn: "容器包装プラスチック"
      },
      {
        name: "paper",
        confidence: 0.4,
        score: 0,
        jpn: "古紙・衣類"
      },
      {
        name: "normal",
        confidence: 0.3,
        score: 0,
        jpn: "普通ゴミ"
      },
    ]
    area['shibuya'] = [
      {
        name: "inflammable",
        confidence: 0.4,
        score: 0,
        jpn: "可燃ごみ"
      },
      {
        name: "unflammable",
        confidence: 0.4,
        score: 0,
        jpn: "不燃ごみ"
      },
      {
        name: "recycle",
        confidence: 0.4,
        score: 0,
        jpn: "資源ごみ"
      },
    ]

    // area['osaka'] = [
    //   ['recycle', 'plastic', 'paper', 'normal'],
    //   [0.4, 0.5, 0.4, 0.3],
    //   [0, 0, 0, 0],
    //   ['資源ごみ', '容器包装プラスチック', '古紙・衣類', '普通ゴミ'],
    // ];
    // area['shibuya'] = [
    //   ['inflammable', 'unflammable', 'recycle'],
    //   [0.4, 0.4, 0.4],
    //   [0, 0, 0],
    //   ['可燃ごみ', '不燃ごみ', '資源ごみ'],
    // ];
    return area;
  }

  getGarbage(selectedArea) {
    switch (selectedArea) {
      case 'osaka':
        return this.getOsakaGarbage();
      case 'shibuya':
        return this.getShibuyaGarbage();
    }
  }

  // // 各tagに意味づけをしている
  // // たとえばtrayというキーの中の第一の値であるrecycleはゴミ分別種類を、
  // // 第二の値である"トレイ"は表示選択肢をあらわす
  // // ゴミ分別種類はのちに分別種類別スコアを計上するうえで利用する
  // // 表示選択肢は、そのtagが含まれていれば、分析結果表示後の選択肢として代入するもの
  // // たとえばtrayがtagとして含まれていた時、recycleのスコアに得点が入り、選択肢としてはトレイが代入される
  // // 二つ以上値があるものは、その二つともが処理対象（たとえばcanというtagを選ぶと、空き缶とペットボトルが表示される。スコアも同様）
  // // 三つ目の値は各選択肢に対するゴミ分別方法
  getOsakaGarbage() {
    let garbage = {};
    // 定数宣言部 大阪市
    const recycle = 'recycle';
    const plastic = 'plastic';
    const paper = 'paper';
    const normal = 'normal';
    garbage['tray'] = [[plastic], ['トレイ'], [plastic]];
    garbage['can'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drink'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['bottle'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drinking water'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['beverage'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['tray'] = [[plastic], ['トレイ'], [plastic]];
    garbage['can'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drink'] = [
      [recycle, plastic],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['bottle'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['water'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['beverage'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['plastic'] = [
      [recycle, plastic, normal],
      [
        '空き缶',
        'ペットボトル',
        'レジ袋',
        'カップ麺の容器',
        '弁当などの空き容器',
        'おもちゃ',
      ],
      [recycle, recycle, plastic, plastic, plastic, normal],
    ];
    garbage['drink_can'] = [[recycle], ['空き缶'], [recycle]];
    garbage['box'] = [
      [recycle, plastic],
      ['空き缶', 'カップ麺の容器', '弁当などの空き容器', '段ボール'],
      [recycle, plastic, plastic, paper],
    ];
    garbage['bag'] = [
      [plastic, normal],
      ['カップ麺の容器', '弁当などの空き容器', 'カバン', 'レジ袋'],
      [plastic, plastic, normal, plastic],
    ];
    garbage['cup'] = [
      [plastic, normal],
      ['カップ麺の容器', '弁当などの空き容器', 'カップ'],
      [plastic, plastic, normal],
    ];
    garbage['bowl'] = [
      [plastic],
      ['カップ麺の容器', '弁当などの空き容器'],
      [plastic, plastic],
    ];
    garbage['soup'] = [[plastic], ['カップ麺の容器'], [plastic]];
    garbage['coffee'] = [
      [plastic, normal],
      ['マグカップ', 'カップ麺の容器'],
      [normal, plastic],
    ];
    garbage['hot'] = [
      [plastic],
      ['カップ麺の容器', '弁当などの空き容器'],
      [plastic, plastic],
    ];
    garbage['plate'] = [
      [plastic, normal],
      ['カップ麺の容器', '弁当などの空き容器', '皿'],
      [plastic, plastic, normal],
    ];
    garbage['food'] = [
      [plastic, normal],
      ['カップ麺の容器', '弁当などの空き容器', '食べ物'],
      [plastic, plastic, normal],
    ];
    garbage['newspaper'] = [
      [paper],
      ['新聞', '紙', '雑誌'],
      [paper, paper, paper],
    ];
    garbage['text'] = [[paper], ['新聞', '紙', '雑誌'], [paper, paper, paper]];
    garbage['cloth'] = [[paper], ['服', 'ズボン'], [paper, paper]];
    garbage['clothing'] = [
      [paper],
      ['服', 'ズボン', '靴下', '手袋'],
      [paper, paper, paper, paper],
    ];
    garbage['wearing'] = [
      [paper],
      ['服', 'ズボン', '靴下', '手袋'],
      [paper, paper, paper, paper],
    ];
    garbage['shirt'] = [[paper], ['服', 'ズボン'], [paper, paper]];
    garbage['coat'] = [[paper], ['服'], [paper]];
    garbage['jacket'] = [[paper], ['服'], [paper]];
    garbage['towel'] = [
      [paper],
      ['タオル', '服', 'ズボン'],
      [paper, paper, paper],
    ];
    garbage['glass'] = [
      [normal, recycle],
      ['食器', 'ビン', 'ガラス'],
      [normal, recycle, normal],
    ];
    garbage['vase'] = [[normal], ['花瓶', '壺'], [normal, normal]];
    garbage['kitchen'] = [
      [normal],
      ['食器', '電気ポット', '鍋(30cm)', 'キッチン用品'],
      [normal, normal, normal, normal],
    ];
    garbage['pen'] = [[normal, plastic], ['ボールペン'], [normal]];
    garbage['pot'] = [[normal], ['電気ポット'], [normal]];
    garbage['brush'] = [[normal], ['歯ブラシ'], [normal]];
    garbage['bed'] = [
      [normal],
      ['シーツ', '枕', 'カーテン'],
      [normal, normal, normal],
    ];
    garbage['pillow'] = [[normal], ['枕'], [normal]];
    garbage['mug'] = [[normal], ['マグカップ', '食器'], [normal, normal]];
    garbage['hanger'] = [[normal], ['ハンガー', '衣類'], [normal, normal]];
    garbage['cellphone'] = [[normal], ['電話'], [normal]];
    garbage['mixer'] = [[normal], ['ミキサー'], [normal]];
    garbage['blender'] = [[normal], ['ミキサー'], [normal]];
    garbage['open'] = [[plastic, normal], ['弁当などの空き容器'], [plastic]];
    return garbage;
  }

  getShibuyaGarbage() {
    let garbage = {};

    // 定数宣言部 大阪市
    const recycle = 'recycle';
    const plastic = 'plastic';
    const paper = 'paper';
    const normal = 'normal';
    // 定数宣言部 渋谷区
    const inflammable = 'inflammable';
    const unflammable = 'unflammable';

    garbage['tray'] = [[inflammable], ['トレイ'], [inflammable]];
    garbage['can'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drink'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['bottle'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drinking water'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['beverage'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['tray'] = [[inflammable], ['トレイ'], [inflammable]];
    garbage['can'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drink'] = [
      [recycle, inflammable],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['bottle'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['drinking water'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['beverage'] = [
      [recycle],
      ['空き缶', 'ペットボトル'],
      [recycle, recycle],
    ];
    garbage['inflammable'] = [
      [recycle, inflammable, unflammable],
      [
        '空き缶',
        'ペットボトル',
        'レジ袋',
        'カップ麺の容器',
        '弁当などの空き容器',
        'おもちゃ',
      ],
      [recycle, recycle, inflammable, inflammable, inflammable, unflammable],
    ];
    garbage['drink_can'] = [[recycle], ['空き缶'], [recycle]];
    garbage['box'] = [
      [recycle, inflammable],
      ['空き缶', 'カップ麺の容器', '弁当などの空き容器', '段ボール'],
      [recycle, inflammable, inflammable, recycle],
    ];
    garbage['bag'] = [
      [inflammable],
      ['カップ麺の容器', '弁当などの空き容器', 'カバン', 'レジ袋'],
      [inflammable, inflammable, inflammable, inflammable],
    ];
    garbage['cup'] = [
      [inflammable],
      ['カップ麺の容器', '弁当などの空き容器', 'カップ'],
      [inflammable, inflammable, unflammable],
    ];
    garbage['bowl'] = [
      [inflammable],
      ['カップ麺の容器', '弁当などの空き容器'],
      [inflammable, inflammable],
    ];
    garbage['soup'] = [[inflammable], ['カップ麺の容器'], [inflammable]];
    garbage['coffee'] = [
      [inflammable],
      ['マグカップ', 'カップ麺の容器'],
      [unflammable, inflammable],
    ];
    garbage['hot'] = [
      [inflammable],
      ['カップ麺の容器', '弁当などの空き容器'],
      [inflammable, inflammable],
    ];
    garbage['plate'] = [
      [inflammable],
      ['カップ麺の容器', '弁当などの空き容器'],
      [inflammable, inflammable],
    ];
    garbage['food'] = [
      [inflammable],
      ['カップ麺の容器', '弁当などの空き容器', '食べ物'],
      [inflammable, inflammable, inflammable],
    ];
    garbage['newspaper'] = [
      [recycle],
      ['新聞', '紙', '雑誌'],
      [recycle, recycle, recycle],
    ];
    garbage['text'] = [
      [recycle],
      ['新聞', '紙', '雑誌'],
      [recycle, recycle, recycle],
    ];
    garbage['cloth'] = [
      [inflammable],
      ['服', 'ズボン'],
      [inflammable, inflammable],
    ];
    garbage['clothing'] = [
      [inflammable],
      ['服', 'ズボン', '靴下', '手袋'],
      [inflammable, inflammable, inflammable, inflammable],
    ];
    garbage['wearing'] = [
      [inflammable],
      ['服', 'ズボン', '靴下', '手袋'],
      [inflammable, inflammable, inflammable, inflammable],
    ];
    garbage['shirt'] = [
      [inflammable],
      ['服', 'ズボン'],
      [inflammable, inflammable],
    ];
    garbage['coat'] = [[inflammable], ['服'], [inflammable]];
    garbage['jacket'] = [[inflammable], ['服'], [inflammable]];
    garbage['towel'] = [
      [inflammable],
      ['タオル', '服', 'ズボン'],
      [inflammable, inflammable, inflammable],
    ];
    garbage['glass'] = [
      [unflammable, recycle],
      ['食器', 'ビン', 'ガラス'],
      [unflammable, recycle, unflammable],
    ];
    garbage['vase'] = [
      [unflammable],
      ['花瓶', '壺'],
      [unflammable, unflammable],
    ];
    garbage['kitchen'] = [
      [unflammable],
      ['食器', '電気ポット', '鍋(30cm)'],
      [unflammable, unflammable, unflammable],
    ];
    garbage['pen'] = [[inflammable], ['ボールペン'], [inflammable]];
    garbage['pot'] = [[unflammable], ['電気ポット'], [unflammable]];
    garbage['brush'] = [[inflammable], ['歯ブラシ'], [inflammable]];
    garbage['bed'] = [
      [inflammable],
      ['シーツ', '枕', 'カーテン'],
      [inflammable, inflammable, inflammable],
    ];
    garbage['pillow'] = [[inflammable], ['枕'], [inflammable]];
    garbage['mug'] = [
      [unflammable],
      ['マグカップ', '食器'],
      [unflammable, unflammable],
    ];
    garbage['hanger'] = [
      [inflammable],
      ['ハンガー', '衣類'],
      [inflammable, inflammable],
    ];
    garbage['cellphone'] = [[unflammable], ['電話'], [unflammable]];
    garbage['mixer'] = [[unflammable], ['ミキサー'], [unflammable]];
    garbage['blender'] = [[unflammable], ['ミキサー'], [unflammable]];
    return garbage;
  }

  ngOnInit(): void {}
}
